from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.config import BASE_DIR


RULER_CALIBRATION_PATH = Path(
    os.getenv(
        "RULER_CALIBRATION_PATH",
        str(BASE_DIR / "model_assets" / "ruler_calibration.json"),
    )
)


@dataclass(frozen=True)
class RulerCalibration:
    ratio_to_thickness_slope: float
    ratio_to_thickness_intercept: float
    ratio_constant_tick_to_cm: float | None
    min_ruler_confidence: float
    knn_neighbors: int
    reference_samples: tuple["RulerReferenceSample", ...]
    min_thickness_cm: float
    max_thickness_cm: float


@dataclass(frozen=True)
class RulerEstimate:
    thickness_cm: float
    ruler_confidence: float
    stem_width_pixels: float
    ruler_spacing_pixels: float


@dataclass(frozen=True)
class RulerReferenceSample:
    predicted_cm_raw: float
    ruler_confidence: float
    stem_width_px: float
    ruler_tick_spacing_px: float
    target_cm: float


def _default_calibration() -> RulerCalibration:
    # Backward-compatible defaults.
    return RulerCalibration(
        ratio_to_thickness_slope=0.0223,
        ratio_to_thickness_intercept=0.3206,
        ratio_constant_tick_to_cm=None,
        min_ruler_confidence=0.65,
        knn_neighbors=5,
        reference_samples=(),
        min_thickness_cm=0.1,
        max_thickness_cm=3.5,
    )


@lru_cache(maxsize=1)
def load_ruler_calibration() -> RulerCalibration:
    defaults = _default_calibration()
    if not RULER_CALIBRATION_PATH.exists():
        return defaults

    with RULER_CALIBRATION_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    slope = float(payload.get("ratio_to_thickness_slope", defaults.ratio_to_thickness_slope))
    intercept = float(
        payload.get(
            "ratio_to_thickness_intercept",
            defaults.ratio_to_thickness_intercept,
        )
    )
    ratio_constant_raw = payload.get("ratio_constant_tick_to_cm", defaults.ratio_constant_tick_to_cm)
    ratio_constant = (
        None
        if ratio_constant_raw is None
        else float(ratio_constant_raw)
    )
    min_conf = float(payload.get("min_ruler_confidence", defaults.min_ruler_confidence))
    knn_neighbors = int(payload.get("knn_neighbors", defaults.knn_neighbors))
    min_cm = float(payload.get("min_thickness_cm", defaults.min_thickness_cm))
    max_cm = float(payload.get("max_thickness_cm", defaults.max_thickness_cm))
    samples_raw = payload.get("reference_samples", [])

    numeric_values = (slope, intercept, min_conf, min_cm, max_cm)
    if not all(math.isfinite(v) for v in numeric_values):
        return defaults
    if ratio_constant is not None and (not math.isfinite(ratio_constant) or ratio_constant <= 0):
        ratio_constant = None
    if min_cm <= 0 or max_cm <= min_cm:
        return defaults

    parsed_samples: list[RulerReferenceSample] = []
    if isinstance(samples_raw, list):
        for item in samples_raw:
            if not isinstance(item, dict):
                continue
            try:
                sample = RulerReferenceSample(
                    predicted_cm_raw=float(item["predicted_cm_raw"]),
                    ruler_confidence=float(item["ruler_confidence"]),
                    stem_width_px=float(item["stem_width_px"]),
                    ruler_tick_spacing_px=float(item["ruler_tick_spacing_px"]),
                    target_cm=float(item["target_cm"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
            values = (
                sample.predicted_cm_raw,
                sample.ruler_confidence,
                sample.stem_width_px,
                sample.ruler_tick_spacing_px,
                sample.target_cm,
            )
            if all(math.isfinite(v) for v in values):
                parsed_samples.append(sample)

    return RulerCalibration(
        ratio_to_thickness_slope=slope,
        ratio_to_thickness_intercept=intercept,
        ratio_constant_tick_to_cm=ratio_constant,
        min_ruler_confidence=max(0.0, min(1.0, min_conf)),
        knn_neighbors=max(1, min(15, knn_neighbors)),
        reference_samples=tuple(parsed_samples),
        min_thickness_cm=min_cm,
        max_thickness_cm=max_cm,
    )


def _estimate_stem_width_pixels_hsv(image_bgr: np.ndarray) -> float | None:
    height, width = image_bgr.shape[:2]
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
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if area < 250 or h < 0.15 * height or w > 0.40 * width:
            continue
        aspect_ratio = h / float(max(w, 1))
        if aspect_ratio < 1.1:
            continue

        center_x = x + w / 2.0
        center_score = max(0.0, 1.0 - abs(center_x - width / 2.0) / (width / 2.0))
        score = (
            0.45 * min(1.0, aspect_ratio / 6.0)
            + 0.40 * center_score
            + 0.15 * min(1.0, area / (0.08 * height * width))
        )
        if best is None or score > best[0]:
            best = (score, contour)

    if best is None:
        return None

    (_, _), (rect_w, rect_h), _ = cv2.minAreaRect(best[1])
    if rect_w <= 0 or rect_h <= 0:
        return None
    return float(min(rect_w, rect_h))


def _detect_ruler_spacing_pixels(image_bgr: np.ndarray) -> tuple[float | None, float]:
    height, width = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 50, 150)

    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=30,
        minLineLength=max(8, int(width * 0.012)),
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
            line_length = float(math.hypot(dx, dy))
            if line_length < 8:
                continue

            angle = abs(math.degrees(math.atan2(dy, dx)))
            if not (angle < 11 or angle > 169):
                continue

            center_x = (x1 + x2) / 2.0
            if side == "left" and center_x > width * 0.42:
                continue
            if side == "right" and center_x < width * 0.58:
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
        length_score = min(1.0, float(np.median(lengths)) / max(12.0, width * 0.03))
        confidence = float(np.clip(0.50 * regularity + 0.35 * count_score + 0.15 * length_score, 0.0, 1.0))

        if best is None or confidence > best[1]:
            best = (spacing, confidence)

    if best is None:
        return None, 0.0
    return best


def _knn_calibrate_thickness_cm(
    predicted_cm_raw: float,
    ruler_confidence: float,
    stem_width_px: float,
    ruler_spacing_px: float,
    calibration: RulerCalibration,
) -> float | None:
    samples = calibration.reference_samples
    if not samples:
        return None

    feature_matrix = np.array(
        [
            [
                sample.predicted_cm_raw,
                sample.ruler_confidence,
                sample.stem_width_px,
                sample.ruler_tick_spacing_px,
            ]
            for sample in samples
        ],
        dtype=np.float32,
    )
    targets = np.array([sample.target_cm for sample in samples], dtype=np.float32)
    query = np.array(
        [predicted_cm_raw, ruler_confidence, stem_width_px, ruler_spacing_px],
        dtype=np.float32,
    )

    # Normalize each feature to keep distances balanced.
    scales = np.std(feature_matrix, axis=0)
    scales = np.where(scales < 1e-6, 1.0, scales)
    normalized = (feature_matrix - query) / scales
    distances = np.linalg.norm(normalized, axis=1)

    if len(distances) == 0:
        return None

    exact_index = int(np.argmin(distances))
    if float(distances[exact_index]) < 1e-8:
        return float(targets[exact_index])

    k = min(calibration.knn_neighbors, len(distances))
    nearest = np.argsort(distances)[:k]
    nearest_dist = distances[nearest]
    nearest_targets = targets[nearest]
    weights = 1.0 / np.maximum(nearest_dist, 1e-6)
    prediction = float(np.sum(weights * nearest_targets) / np.sum(weights))
    if not math.isfinite(prediction):
        return None
    return prediction


def estimate_thickness_with_ruler(
    image_bgr: np.ndarray,
    fallback_stem_width_pixels: float | None = None,
) -> RulerEstimate | None:
    calibration = load_ruler_calibration()

    ruler_spacing_pixels, ruler_confidence = _detect_ruler_spacing_pixels(image_bgr)
    if ruler_spacing_pixels is None or ruler_confidence < calibration.min_ruler_confidence:
        return None

    stem_width_pixels = _estimate_stem_width_pixels_hsv(image_bgr)
    if stem_width_pixels is None:
        stem_width_pixels = fallback_stem_width_pixels
    if stem_width_pixels is None or stem_width_pixels <= 0:
        return None

    thickness_cm: float | None = None
    if calibration.ratio_constant_tick_to_cm is not None:
        pixels_per_cm = ruler_spacing_pixels * calibration.ratio_constant_tick_to_cm
        if pixels_per_cm > 0:
            predicted_cm_raw = float(stem_width_pixels / pixels_per_cm)
            thickness_cm = _knn_calibrate_thickness_cm(
                predicted_cm_raw=predicted_cm_raw,
                ruler_confidence=ruler_confidence,
                stem_width_px=float(stem_width_pixels),
                ruler_spacing_px=float(ruler_spacing_pixels),
                calibration=calibration,
            )

    # Backward-compatible fallback: linear mapping from raw ratio.
    if thickness_cm is None:
        raw_ratio = stem_width_pixels / ruler_spacing_pixels
        thickness_cm = (
            calibration.ratio_to_thickness_slope * raw_ratio
            + calibration.ratio_to_thickness_intercept
        )

    if not math.isfinite(thickness_cm):
        return None

    thickness_cm = float(
        np.clip(
            thickness_cm,
            calibration.min_thickness_cm,
            calibration.max_thickness_cm,
        )
    )

    return RulerEstimate(
        thickness_cm=round(thickness_cm, 3),
        ruler_confidence=round(float(ruler_confidence), 4),
        stem_width_pixels=round(float(stem_width_pixels), 2),
        ruler_spacing_pixels=round(float(ruler_spacing_pixels), 2),
    )
