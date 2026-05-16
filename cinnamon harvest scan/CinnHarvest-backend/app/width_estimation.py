from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.ruler_reference import estimate_thickness_with_ruler
from app.width_inference import predict_from_thickness_cm

@dataclass
class WidthEstimation:
    width_pixels: float | None
    normalized_width: float | None
    confidence: float
    is_valid: bool
    low_confidence: bool
    message: str


MAX_ANALYSIS_DIM = int(os.getenv("MAX_ANALYSIS_IMAGE_DIM", "1280"))


def _downscale_for_analysis(image_bgr: np.ndarray) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    largest_side = max(height, width)
    if largest_side <= MAX_ANALYSIS_DIM:
        return image_bgr

    scale = MAX_ANALYSIS_DIM / float(largest_side)
    resized_w = max(1, int(round(width * scale)))
    resized_h = max(1, int(round(height * scale)))
    return cv2.resize(image_bgr, (resized_w, resized_h), interpolation=cv2.INTER_AREA)


def _preprocess_edges(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    median_val = np.median(blurred)
    lower = int(max(0, 0.66 * median_val))
    upper = int(min(255, 1.33 * median_val))
    edges = cv2.Canny(blurred, lower, upper)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    edges = cv2.dilate(edges, kernel, iterations=1)
    return edges


def _select_contour(
    edges: np.ndarray,
    image_area: int,
    min_area: float = 1500.0,
    min_area_ratio: float = 0.005,
    min_aspect_ratio: float = 2.5,
) -> tuple[np.ndarray | None, tuple[int, int, int, int] | None]:
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, None

    area_threshold = max(min_area, min_area_ratio * float(image_area))
    strict_candidates: list[tuple[float, np.ndarray, tuple[int, int, int, int]]] = []
    medium_candidates: list[tuple[float, np.ndarray, tuple[int, int, int, int]]] = []
    loose_candidates: list[tuple[float, np.ndarray, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < area_threshold:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if w <= 0:
            continue
        aspect = h / float(w)
        if aspect > min_aspect_ratio:
            strict_candidates.append((area, contour, (x, y, w, h)))
        elif aspect > 1.2:
            medium_candidates.append((area, contour, (x, y, w, h)))
        else:
            loose_candidates.append((area, contour, (x, y, w, h)))

    candidates = strict_candidates or medium_candidates or loose_candidates
    if not candidates:
        return None, None
    candidates.sort(key=lambda item: item[0], reverse=True)
    _, contour, bbox = candidates[0]
    return contour, bbox


def _select_contour_from_intensity(image_bgr: np.ndarray) -> tuple[np.ndarray | None, tuple[int, int, int, int] | None]:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary = cv2.bitwise_not(binary)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    h, w = gray.shape[:2]
    area_threshold = max(600.0, 0.002 * float(h * w))
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, np.ndarray, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < area_threshold:
            continue
        x, y, bw, bh = cv2.boundingRect(contour)
        if bw <= 0 or bh <= 0:
            continue
        candidates.append((area, contour, (x, y, bw, bh)))

    if not candidates:
        return None, None
    candidates.sort(key=lambda item: item[0], reverse=True)
    _, contour, bbox = candidates[0]
    return contour, bbox


def _trim_outliers(values: list[float]) -> list[float]:
    if len(values) < 10:
        return values
    sorted_vals = sorted(values)
    trim = max(1, int(len(sorted_vals) * 0.10))
    if len(sorted_vals) <= 2 * trim:
        return sorted_vals
    return sorted_vals[trim:-trim]


def _fallback_width_from_contour(contour: np.ndarray, bbox: tuple[int, int, int, int]) -> float:
    rect = cv2.minAreaRect(contour)
    (_, _), (rw, rh), _ = rect
    if rw > 0 and rh > 0:
        return float(min(rw, rh))
    _, _, bw, _ = bbox
    return float(max(1, bw))


def estimate_width(image_path: Path) -> WidthEstimation:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return WidthEstimation(
            width_pixels=None,
            normalized_width=None,
            confidence=0.0,
            is_valid=False,
            low_confidence=True,
            message="Unable to read image.",
        )

    image = _downscale_for_analysis(image)
    edges = _preprocess_edges(image)
    h, w = image.shape[:2]
    contour, bbox = _select_contour(edges, h * w)
    if contour is None or bbox is None:
        contour, bbox = _select_contour_from_intensity(image)
        if contour is None or bbox is None:
            return WidthEstimation(
                width_pixels=None,
                normalized_width=None,
                confidence=0.0,
                is_valid=False,
                low_confidence=True,
                message="No valid contour detected.",
            )

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, thickness=cv2.FILLED)

    x, y, bw, bh = bbox
    start = int(y + bh * 0.20)
    end = int(y + bh * 0.80)
    widths: list[float] = []

    for row in range(start, end, 2):
        xs = np.where(mask[row] > 0)[0]
        if xs.size < 2:
            continue
        width_px = float(xs[-1] - xs[0] + 1)
        if width_px > 0:
            widths.append(width_px)

    filtered = _trim_outliers(widths)
    if not filtered:
        width_pixels = _fallback_width_from_contour(contour, bbox)
        normalized_width = width_pixels / float(w)
        is_valid = 0.01 <= normalized_width <= 0.5
        ruler_result = estimate_thickness_with_ruler(
            image,
            fallback_stem_width_pixels=width_pixels,
        )
        if ruler_result is not None:
            thickness_prediction = predict_from_thickness_cm(ruler_result.thickness_cm)
            if thickness_prediction is not None:
                normalized_width = float(thickness_prediction["normalized_width"])
                is_valid = 0.01 <= normalized_width <= 0.5
                return WidthEstimation(
                    width_pixels=round(ruler_result.stem_width_pixels, 2),
                    normalized_width=round(normalized_width, 6),
                    confidence=round(max(0.35, ruler_result.ruler_confidence), 4),
                    is_valid=is_valid,
                    low_confidence=not is_valid,
                    message=(
                        "ok (ruler-reference)"
                        if is_valid
                        else "Ruler-reference normalized width out of valid range."
                    ),
                )
        return WidthEstimation(
            width_pixels=round(width_pixels, 2),
            normalized_width=round(normalized_width, 6),
            confidence=0.35 if is_valid else 0.2,
            is_valid=is_valid,
            low_confidence=True,
            message="Used contour-box fallback width.",
        )

    width_pixels = float(np.median(filtered))
    normalized_width = width_pixels / float(w)
    width_std = float(np.std(filtered))
    width_mean = float(np.mean(filtered))
    coeff_var = width_std / width_mean if width_mean > 0 else 1.0
    sample_score = min(1.0, len(filtered) / 80.0)
    variance_score = max(0.0, 1.0 - coeff_var / 0.35)
    confidence = float(np.clip(0.55 * variance_score + 0.45 * sample_score, 0.0, 1.0))

    is_valid = 0.01 <= normalized_width <= 0.5
    low_confidence = coeff_var > 0.45 or (len(filtered) < 12 and coeff_var > 0.35)
    message = "ok"

    ruler_result = estimate_thickness_with_ruler(
        image,
        fallback_stem_width_pixels=width_pixels,
    )
    if ruler_result is not None:
        thickness_prediction = predict_from_thickness_cm(ruler_result.thickness_cm)
        if thickness_prediction is not None:
            normalized_width = float(thickness_prediction["normalized_width"])
            is_valid = 0.01 <= normalized_width <= 0.5
            low_confidence = not is_valid
            confidence = float(
                np.clip(max(confidence, ruler_result.ruler_confidence), 0.0, 1.0)
            )
            message = (
                "ok (ruler-reference)"
                if is_valid
                else "Ruler-reference normalized width out of valid range."
            )
            width_pixels = float(ruler_result.stem_width_pixels)

    if not is_valid:
        message = "Normalized width out of valid range."
    elif low_confidence:
        message = "Width variance too high."

    return WidthEstimation(
        width_pixels=round(width_pixels, 2),
        normalized_width=round(normalized_width, 6),
        confidence=round(confidence, 4),
        is_valid=is_valid,
        low_confidence=low_confidence,
        message=message,
    )
