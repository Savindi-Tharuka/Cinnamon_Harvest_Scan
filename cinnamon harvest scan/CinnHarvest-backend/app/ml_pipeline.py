from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from torchvision import models, transforms

from app.config import BASE_DIR
from app.width_estimation import estimate_width as estimate_width_features
from app.width_inference import classify_width as classify_width_category
from app.width_inference import load_thresholds
from app.width_inference import predict_months as infer_months


MODEL_PATH = Path(
    os.getenv("MODEL_PATH", str(BASE_DIR / "model_assets" / "model.pth"))
)
CLASS_NAMES = ["immature", "mature", "overmature", "invalid"]
CLASS_TO_STATUS = {
    "immature": "unmatured",
    "mature": "matured",
    "overmature": "overmatured",
    "invalid": "invalid",
}
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_model: torch.nn.Module | None = None
MIN_VALID_WIDTH = 0.01
MAX_VALID_WIDTH = 0.5
_threads = max(1, min(4, os.cpu_count() or 1))
torch.set_num_threads(_threads)
torch.set_num_interop_threads(1)
_transform = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


def _load_model() -> torch.nn.Module:
    global _model
    if _model is not None:
        return _model

    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")

    model = models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = torch.nn.Linear(in_features, len(CLASS_NAMES))

    state = torch.load(MODEL_PATH, map_location=_device)
    model.load_state_dict(state)
    model.to(_device)
    model.eval()
    _model = model
    return model


def warmup_pipeline(logger: logging.Logger | None = None) -> None:
    try:
        _load_model()
        load_thresholds()
    except Exception as exc:
        if logger is not None:
            logger.warning("ML warmup skipped due to error: %s", exc)


def classify_image(image_path: Path) -> dict[str, Any]:
    model = _load_model()
    with Image.open(image_path) as image:
        image = image.convert("RGB")
        tensor = _transform(image).unsqueeze(0).to(_device)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze(0)
        pred_index = int(torch.argmax(probs).item())
        confidence = float(probs[pred_index].item())

    return {
        "class": CLASS_NAMES[pred_index],
        "confidence": round(confidence, 4),
    }


def estimate_width(image_path: Path) -> dict[str, Any]:
    result = estimate_width_features(image_path)
    return {
        "width_pixels": result.width_pixels,
        "normalized_width": result.normalized_width,
        "confidence": result.confidence,
        "is_valid": result.is_valid,
        "low_confidence": result.low_confidence,
        "message": result.message,
    }


def predict_months(normalized_width: float) -> dict[str, Any]:
    return {
        "months": infer_months(normalized_width),
        "width_category": classify_width_category(normalized_width),
    }


def run_ml_pipeline(image_path: Path, logger: logging.Logger) -> dict[str, Any]:
    try:
        cls_result = classify_image(image_path)
    except Exception as exc:
        logger.exception("Image classification failed: %s", exc)
        return {
            "class": "invalid",
            "normalized_width": None,
            "width_category": None,
            "months": None,
            "confidence": 0.0,
            "status": "ok",
        }

    predicted_class = cls_result["class"]
    cls_conf = float(cls_result["confidence"])

    if predicted_class != "immature":
        return {
            "class": predicted_class,
            "normalized_width": None,
            "width_category": None,
            "months": None,
            "confidence": cls_conf,
            "status": "ok",
        }

    width_result = estimate_width(image_path)
    normalized_width = width_result["normalized_width"]

    if normalized_width is None or not math.isfinite(float(normalized_width)):
        thresholds = load_thresholds()
        normalized_width = (thresholds["t1"] + thresholds["t2"]) / 2.0
        logger.warning(
            "Width estimation missing; using threshold midpoint fallback=%s",
            normalized_width,
        )
    else:
        normalized_width = float(normalized_width)

    if not width_result["is_valid"] or width_result["low_confidence"]:
        logger.warning(
            "Width estimation uncertain; proceeding with fallback-safe width. valid=%s low_conf=%s msg=%s",
            width_result["is_valid"],
            width_result["low_confidence"],
            width_result["message"],
        )
        normalized_width = min(MAX_VALID_WIDTH, max(MIN_VALID_WIDTH, normalized_width))

    infer_result = predict_months(float(normalized_width))
    months = infer_result["months"]
    if months is None:
        logger.warning(
            "Month inference failed for normalized_width=%s; using default range fallback.",
            normalized_width,
        )
        months = "10 to 13 months"

    return {
        "class": predicted_class,
        "normalized_width": round(float(normalized_width), 6),
        "width_category": infer_result["width_category"],
        "months": months,
        "confidence": cls_conf,
        "status": "ok",
    }
