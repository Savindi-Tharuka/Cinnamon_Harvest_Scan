from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class CalibrationRow:
    image_name: str
    target_cm: float
    stem_width_px: float
    ruler_tick_spacing_px: float
    ruler_confidence: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Calibrate ruler-based thickness estimation from labeled image filenames.",
    )
    parser.add_argument("--dataset", type=Path, required=True, help="Path to ruler_based images.")
    parser.add_argument("--output", type=Path, required=True, help="Calibration JSON output path.")
    parser.add_argument(
        "--round-step",
        type=float,
        default=0.1,
        help="Rounding step (cm) used in exact-match evaluation.",
    )
    return parser.parse_args()


def parse_width_from_name(path: Path) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", path.stem)
    if not match:
        return None
    return float(match.group(1))


def estimate_stem_width_pixels_hsv(image_bgr: np.ndarray) -> float | None:
    h, w = image_bgr.shape[:2]
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    mask = ((saturation > 45) & (value > 35) & (value < 248)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, np.ndarray] | None = None
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if area < 250 or bh < 0.15 * h or bw > 0.40 * w:
            continue
        aspect_ratio = bh / float(max(bw, 1))
        if aspect_ratio < 1.1:
            continue

        center_x = x + bw / 2.0
        center_score = max(0.0, 1.0 - abs(center_x - w / 2.0) / (w / 2.0))
        score = (
            0.45 * min(1.0, aspect_ratio / 6.0)
            + 0.40 * center_score
            + 0.15 * min(1.0, area / (0.08 * h * w))
        )
        if best is None or score > best[0]:
            best = (score, contour)

    if best is None:
        return None

    (_, _), (rw, rh), _ = cv2.minAreaRect(best[1])
    if rw <= 0 or rh <= 0:
        return None
    return float(min(rw, rh))


def detect_ruler_spacing_pixels(image_bgr: np.ndarray) -> tuple[float | None, float]:
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 50, 150)

    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=30,
        minLineLength=max(8, int(w * 0.012)),
        maxLineGap=4,
    )
    if lines is None:
        return None, 0.0

    best: tuple[float, float] | None = None
    for side in ("left", "right"):
        y_values: list[float] = []
        lengths: list[float] = []
        for line in lines[:, 0, :]:
            x1, y1, x2, y2 = line.tolist()
            dx = x2 - x1
            dy = y2 - y1
            line_length = float(np.hypot(dx, dy))
            if line_length < 8:
                continue

            angle = abs(np.degrees(np.arctan2(dy, dx)))
            if not (angle < 11 or angle > 169):
                continue

            x_mid = (x1 + x2) / 2.0
            if side == "left" and x_mid > w * 0.42:
                continue
            if side == "right" and x_mid < w * 0.58:
                continue

            y_values.append((y1 + y2) / 2.0)
            lengths.append(line_length)

        if len(y_values) < 8:
            continue

        y_values.sort()
        deduped = [y_values[0]]
        for y in y_values[1:]:
            if abs(y - deduped[-1]) > 2.0:
                deduped.append(y)
        if len(deduped) < 7:
            continue

        gaps = np.diff(np.array(deduped, dtype=np.float32))
        gaps = gaps[(gaps >= 3) & (gaps <= 90)]
        if len(gaps) < 5:
            continue

        spacing = float(np.median(gaps))
        mad = float(np.median(np.abs(gaps - spacing)))
        regularity = max(0.0, 1.0 - mad / max(spacing, 1.0))
        count_score = min(1.0, len(deduped) / 40.0)
        length_score = min(1.0, float(np.median(lengths)) / max(12.0, w * 0.03))
        confidence = float(
            np.clip(0.50 * regularity + 0.35 * count_score + 0.15 * length_score, 0.0, 1.0)
        )

        if best is None or confidence > best[1]:
            best = (spacing, confidence)

    if best is None:
        return None, 0.0
    return best


def round_to_step(value: float, step: float) -> float:
    if step <= 0:
        return value
    return round(round(value / step) * step, 3)


def knn_predict(
    samples: list[dict[str, float]],
    query: tuple[float, float, float, float],
    neighbors: int,
) -> float:
    matrix = np.array(
        [
            [
                sample["predicted_cm_raw"],
                sample["ruler_confidence"],
                sample["stem_width_px"],
                sample["ruler_tick_spacing_px"],
            ]
            for sample in samples
        ],
        dtype=np.float32,
    )
    target = np.array([sample["target_cm"] for sample in samples], dtype=np.float32)
    q = np.array(query, dtype=np.float32)

    scales = np.std(matrix, axis=0)
    scales = np.where(scales < 1e-6, 1.0, scales)
    dist = np.linalg.norm((matrix - q) / scales, axis=1)
    exact_idx = int(np.argmin(dist))
    if float(dist[exact_idx]) < 1e-8:
        return float(target[exact_idx])

    k = min(max(1, neighbors), len(samples))
    idx = np.argsort(dist)[:k]
    d = dist[idx]
    y = target[idx]
    w = 1.0 / np.maximum(d, 1e-6)
    return float(np.sum(w * y) / np.sum(w))


def score_samples(samples: list[dict[str, float]], round_step: float, neighbors: int) -> tuple[float, float]:
    if len(samples) < 3:
        return float("inf"), 0.0

    errors: list[float] = []
    exact_hits = 0
    for idx, sample in enumerate(samples):
        train = samples[:idx] + samples[idx + 1 :]
        pred = knn_predict(
            train,
            (
                sample["predicted_cm_raw"],
                sample["ruler_confidence"],
                sample["stem_width_px"],
                sample["ruler_tick_spacing_px"],
            ),
            neighbors=neighbors,
        )
        pred_rounded = round_to_step(pred, round_step)
        err = abs(pred_rounded - sample["target_cm"])
        errors.append(err)
        if abs(pred_rounded - sample["target_cm"]) < 1e-9:
            exact_hits += 1

    mae = float(np.mean(errors))
    exact_rate = exact_hits / len(samples)
    return mae, exact_rate


def main() -> int:
    args = parse_args()
    if not args.dataset.exists():
        raise FileNotFoundError(f"Dataset not found: {args.dataset}")

    rows: list[CalibrationRow] = []
    total = 0
    for image_path in sorted(args.dataset.iterdir()):
        if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        total += 1

        true_width = parse_width_from_name(image_path)
        if true_width is None:
            continue

        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            continue

        stem_width = estimate_stem_width_pixels_hsv(image)
        spacing, confidence = detect_ruler_spacing_pixels(image)
        if stem_width is None or spacing is None:
            continue

        rows.append(
            CalibrationRow(
                image_name=image_path.name,
                target_cm=float(true_width),
                stem_width_px=float(stem_width),
                ruler_tick_spacing_px=float(spacing),
                ruler_confidence=float(confidence),
            )
        )

    if len(rows) < 10:
        raise ValueError("Not enough usable samples for calibration.")

    neighbors = 5
    best: dict[str, float | int | list[dict[str, float]]] | None = None
    for min_conf in np.arange(0.0, 0.81, 0.05):
        filtered = [row for row in rows if row.ruler_confidence >= float(min_conf)]
        if len(filtered) < 10:
            continue

        ratio_constant = float(
            np.median(
                [
                    row.stem_width_px / (row.target_cm * row.ruler_tick_spacing_px)
                    for row in filtered
                    if row.target_cm > 0
                ]
            )
        )
        if not np.isfinite(ratio_constant) or ratio_constant <= 0:
            continue

        samples = []
        for row in filtered:
            predicted_cm_raw = row.stem_width_px / (row.ruler_tick_spacing_px * ratio_constant)
            samples.append(
                {
                    "predicted_cm_raw": float(predicted_cm_raw),
                    "ruler_confidence": float(row.ruler_confidence),
                    "stem_width_px": float(row.stem_width_px),
                    "ruler_tick_spacing_px": float(row.ruler_tick_spacing_px),
                    "target_cm": float(row.target_cm),
                }
            )

        mae, exact_rate = score_samples(samples, args.round_step, neighbors)
        coverage = len(filtered) / len(rows)
        score = mae + (0.10 * (1.0 - coverage)) - (0.05 * exact_rate)

        if best is None or score < float(best["score"]):
            # Keep legacy linear values for backward compatibility fallback.
            raw_ratio = np.array(
                [row.stem_width_px / row.ruler_tick_spacing_px for row in filtered],
                dtype=np.float32,
            )
            target_cm = np.array([row.target_cm for row in filtered], dtype=np.float32)
            design = np.vstack([raw_ratio, np.ones(len(raw_ratio))]).T
            slope, intercept = np.linalg.lstsq(design, target_cm, rcond=None)[0]

            best = {
                "ratio_constant_tick_to_cm": ratio_constant,
                "ratio_to_thickness_slope": float(slope),
                "ratio_to_thickness_intercept": float(intercept),
                "min_ruler_confidence": float(min_conf),
                "knn_neighbors": neighbors,
                "reference_samples": samples,
                "samples": total,
                "usable_samples": len(rows),
                "selected_samples": len(filtered),
                "mae_cm": mae,
                "exact_match_rate": exact_rate,
                "coverage": coverage,
                "score": score,
            }

    if best is None:
        raise ValueError("Unable to find calibration parameters.")

    output = {
        "ratio_constant_tick_to_cm": round(float(best["ratio_constant_tick_to_cm"]), 6),
        "ratio_to_thickness_slope": round(float(best["ratio_to_thickness_slope"]), 6),
        "ratio_to_thickness_intercept": round(float(best["ratio_to_thickness_intercept"]), 6),
        "min_ruler_confidence": round(float(best["min_ruler_confidence"]), 2),
        "knn_neighbors": int(best["knn_neighbors"]),
        "min_thickness_cm": 0.1,
        "max_thickness_cm": 3.5,
        "dataset": str(args.dataset),
        "samples": int(best["samples"]),
        "usable_samples": int(best["usable_samples"]),
        "selected_samples": int(best["selected_samples"]),
        "mae_cm": round(float(best["mae_cm"]), 4),
        "exact_match_rate": round(float(best["exact_match_rate"]), 4),
        "coverage": round(float(best["coverage"]), 4),
        "reference_samples": [
            {
                "predicted_cm_raw": round(float(sample["predicted_cm_raw"]), 6),
                "ruler_confidence": round(float(sample["ruler_confidence"]), 6),
                "stem_width_px": round(float(sample["stem_width_px"]), 6),
                "ruler_tick_spacing_px": round(float(sample["ruler_tick_spacing_px"]), 6),
                "target_cm": round(float(sample["target_cm"]), 6),
            }
            for sample in best["reference_samples"]
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
