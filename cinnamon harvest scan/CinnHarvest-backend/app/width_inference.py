from __future__ import annotations

import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import BASE_DIR


THRESHOLDS_PATH = Path(
    os.getenv("THRESHOLDS_PATH", str(BASE_DIR / "model_assets" / "thresholds.json"))
)
THICKNESS_T1_CM = float(os.getenv("THICKNESS_T1_CM", "0.8"))
THICKNESS_T2_CM = float(os.getenv("THICKNESS_T2_CM", "1.8"))
MIN_NORMALIZED_WIDTH = 0.01
MAX_NORMALIZED_WIDTH = 0.5


@lru_cache(maxsize=1)
def load_thresholds() -> dict[str, float]:
    if not THRESHOLDS_PATH.exists():
        raise FileNotFoundError(f"Threshold file not found: {THRESHOLDS_PATH}")

    with THRESHOLDS_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    t1 = float(payload["t1"])
    t2 = float(payload["t2"])

    if not math.isfinite(t1) or not math.isfinite(t2):
        raise ValueError("Threshold values must be finite numbers.")
    if t1 > t2:
        raise ValueError("Invalid thresholds: t1 must be <= t2.")

    return {"t1": t1, "t2": t2}


def _coerce_width(normalized_width: Any) -> float | None:
    if normalized_width is None:
        return None
    try:
        value = float(normalized_width)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value):
        return None
    return value


def classify_width(normalized_width: float) -> str:
    width = _coerce_width(normalized_width)
    if width is None:
        return "invalid"

    thresholds = load_thresholds()
    t1 = thresholds["t1"]
    t2 = thresholds["t2"]

    if width < t1:
        return "thin"
    if width < t2:
        return "medium"
    return "thick"


def normalized_width_to_thickness_cm(normalized_width: float) -> float | None:
    width = _coerce_width(normalized_width)
    if width is None:
        return None

    thresholds = load_thresholds()
    t1 = thresholds["t1"]
    t2 = thresholds["t2"]

    if not math.isfinite(THICKNESS_T1_CM) or not math.isfinite(THICKNESS_T2_CM):
        return None
    if THICKNESS_T1_CM == THICKNESS_T2_CM:
        thickness = THICKNESS_T1_CM
    elif t1 == t2:
        thickness = THICKNESS_T1_CM if width <= t1 else THICKNESS_T2_CM
    else:
        slope = (THICKNESS_T2_CM - THICKNESS_T1_CM) / (t2 - t1)
        thickness = THICKNESS_T1_CM + (width - t1) * slope

    return float(max(0.01, min(10.0, thickness)))


def month_range_from_thickness_cm(thickness_cm: float) -> str | None:
    thickness = _coerce_width(thickness_cm)
    if thickness is None or thickness <= 0:
        return None

    if thickness <= 0.8:
        return "14 to 19 months"
    if thickness <= 1.3:
        return "10 to 13 months"
    if thickness <= 1.6:
        return "6 to 9 months"
    if thickness <= 1.9:
        return "3 to 5 months"
    return "2 months"


def predict_months(normalized_width: float) -> str | None:
    thickness_cm = normalized_width_to_thickness_cm(normalized_width)
    if thickness_cm is None:
        return None
    return month_range_from_thickness_cm(thickness_cm)


def predict_from_thickness_cm(thickness_cm: Any) -> dict[str, Any] | None:
    thickness = _coerce_width(thickness_cm)
    if thickness is None or thickness <= 0:
        return None

    thresholds = load_thresholds()
    t1 = thresholds["t1"]
    t2 = thresholds["t2"]

    if not math.isfinite(THICKNESS_T1_CM) or not math.isfinite(THICKNESS_T2_CM):
        return None

    if THICKNESS_T1_CM == THICKNESS_T2_CM:
        normalized_width = t1
    else:
        slope = (t2 - t1) / (THICKNESS_T2_CM - THICKNESS_T1_CM)
        normalized_width = t1 + (thickness - THICKNESS_T1_CM) * slope

    normalized_width = max(
        MIN_NORMALIZED_WIDTH,
        min(MAX_NORMALIZED_WIDTH, float(normalized_width)),
    )
    months = month_range_from_thickness_cm(thickness)
    if months is None:
        return None

    min_cm = min(THICKNESS_T1_CM, THICKNESS_T2_CM)
    max_cm = max(THICKNESS_T1_CM, THICKNESS_T2_CM)
    confidence = 0.9 if min_cm <= thickness <= max_cm else 0.7

    return {
        "thickness_cm": round(float(thickness), 3),
        "normalized_width": round(float(normalized_width), 6),
        "width_category": classify_width(normalized_width),
        "months": months,
        "confidence": round(confidence, 2),
        "status": "ok",
    }
