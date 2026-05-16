from datetime import datetime, timezone
from pathlib import Path
import re
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, url_for
from mongoengine.errors import DoesNotExist, ValidationError as MongoValidationError
from werkzeug.utils import secure_filename

from app.ml_pipeline import CLASS_TO_STATUS, run_ml_pipeline
from app.models import STEM_STATUS_CHOICES, StemAnalysis
from app.width_inference import predict_from_thickness_cm


analysis_blueprint = Blueprint("analysis", __name__)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
STATUS_ALIASES = {
    "immatured": "unmatured",
}


def _error(message: str, status_code: int = 400):
    return jsonify({"error": message}), status_code


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _parse_iso8601(value: str, label: str) -> datetime:
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{label} must be a valid ISO datetime.") from exc

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _serialize_record(record: StemAnalysis) -> dict:
    return {
        "id": str(record.id),
        "status": record.status,
        "confidence": record.confidence,
        "time_required_to_mature_days": record.time_required_to_mature_days,
        "time_required_to_mature_range": record.time_required_to_mature_range,
        "analyzed_at": _to_utc_iso(record.analyzed_at),
        "thickness": record.thickness,
        "photo": {
            "filename": record.photo_filename,
            "path": record.photo_url_path,
            "url": url_for("uploaded_file", filename=record.photo_filename, _external=True),
        },
    }


def _parse_positive_int(name: str, default_value: int) -> int:
    raw_value = request.args.get(name, str(default_value))
    try:
        parsed_value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if parsed_value < 1:
        raise ValueError(f"{name} must be >= 1.")
    return parsed_value


def _parse_optional_float(name: str) -> float | None:
    raw_value = request.args.get(name)
    if raw_value is None:
        return None
    try:
        return float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number.") from exc


def _month_range_to_days(months: str | None) -> int | None:
    if not months:
        return None

    matches = [int(value) for value in re.findall(r"\d+", months)]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0] * 30

    midpoint_months = (matches[0] + matches[1]) / 2.0
    return int(round(midpoint_months * 30))


@analysis_blueprint.post("/analyses/estimate-months")
def estimate_months_from_thickness():
    payload = request.get_json(silent=True) or {}
    raw_thickness = (
        payload.get("thickness_cm")
        if isinstance(payload, dict)
        else None
    )
    if raw_thickness is None:
        raw_thickness = request.form.get("thickness_cm")
    if raw_thickness is None:
        raw_thickness = request.args.get("thickness_cm")

    if raw_thickness is None:
        return _error("thickness_cm is required.")

    try:
        thickness_cm = float(raw_thickness)
    except (TypeError, ValueError):
        return _error("thickness_cm must be a number.")

    if thickness_cm <= 0:
        return _error("thickness_cm must be greater than 0.")

    prediction = predict_from_thickness_cm(thickness_cm)
    if prediction is None:
        current_app.logger.warning(
            "Thickness-based month estimate failed. thickness_cm=%s",
            thickness_cm,
        )
        return _error("Unable to estimate months for the provided thickness.", 422)

    return jsonify(prediction)


@analysis_blueprint.post("/analyses/upload")
def upload_and_analyze():
    image_file = request.files.get("image")
    if image_file is None:
        return _error("image is required as multipart/form-data.")
    if not image_file.filename:
        return _error("image filename is required.")

    thickness_raw = request.form.get("thickness")
    thickness: float | None = None
    if thickness_raw is not None:
        try:
            thickness = float(thickness_raw)
        except ValueError:
            return _error("thickness must be a number.")
        if thickness < 0:
            return _error("thickness must be >= 0.")

    extension = Path(secure_filename(image_file.filename)).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return _error("Only .jpg, .jpeg, .png, and .webp images are supported.")

    filename = f"{uuid4().hex}{extension}"
    upload_dir = Path(current_app.config["UPLOAD_DIR"])
    file_path = upload_dir / filename
    image_file.save(file_path)

    ml_result = run_ml_pipeline(file_path, current_app.logger)
    if ml_result["status"] == "error":
        current_app.logger.warning(
            "ML pipeline returned error state, falling back to invalid status. message=%s",
            ml_result.get("message"),
        )
        ml_result = {
            "class": "invalid",
            "normalized_width": None,
            "width_category": None,
            "months": None,
            "confidence": 0.0,
            "status": "ok",
        }

    predicted_class = ml_result["class"]
    status_value = CLASS_TO_STATUS.get(predicted_class, "invalid")

    months = ml_result["months"]
    time_required_days = _month_range_to_days(months)

    record = StemAnalysis(
        status=status_value,
        confidence=float(ml_result["confidence"]),
        time_required_to_mature_days=time_required_days,
        time_required_to_mature_range=months,
        analyzed_at=datetime.now(timezone.utc),
        photo_filename=filename,
        photo_url_path=f"/uploads/{filename}",
        thickness=thickness,
    )
    record.save()

    response = {
        "class": predicted_class,
        "normalized_width": ml_result["normalized_width"],
        "width_category": ml_result["width_category"],
        "months": ml_result["months"],
        "confidence": ml_result["confidence"],
        "status": "ok",
        "data": _serialize_record(record),
    }
    return jsonify(response), 201


@analysis_blueprint.get("/analyses")
def list_analyses():
    try:
        page = _parse_positive_int("page", 1)
        per_page = _parse_positive_int("per_page", 10)
        if per_page > 100:
            return _error("per_page must be <= 100.")

        status_filter = request.args.get("status")
        if status_filter in STATUS_ALIASES:
            status_filter = STATUS_ALIASES[status_filter]
        if status_filter and status_filter not in STEM_STATUS_CHOICES:
            return _error(
                "status must be one of: unmatured, matured, overmatured, invalid."
            )

        thickness_min = _parse_optional_float("thickness_min")
        thickness_max = _parse_optional_float("thickness_max")
        if thickness_min is not None and thickness_max is not None and thickness_min > thickness_max:
            return _error("thickness_min cannot be greater than thickness_max.")

        analyzed_from_raw = request.args.get("analyzed_from")
        analyzed_to_raw = request.args.get("analyzed_to")
    except ValueError as exc:
        return _error(str(exc))

    query = StemAnalysis.objects
    query = query.filter(status__ne="invalid")
    if status_filter:
        query = query.filter(status=status_filter)
    if thickness_min is not None:
        query = query.filter(thickness__gte=thickness_min)
    if thickness_max is not None:
        query = query.filter(thickness__lte=thickness_max)

    if analyzed_from_raw:
        try:
            analyzed_from = _parse_iso8601(analyzed_from_raw, "analyzed_from")
        except ValueError as exc:
            return _error(str(exc))
        query = query.filter(analyzed_at__gte=analyzed_from)

    if analyzed_to_raw:
        try:
            analyzed_to = _parse_iso8601(analyzed_to_raw, "analyzed_to")
        except ValueError as exc:
            return _error(str(exc))
        query = query.filter(analyzed_at__lte=analyzed_to)

    total = query.count()
    results = (
        query.order_by("-analyzed_at")
        .skip((page - 1) * per_page)
        .limit(per_page)
    )

    return jsonify(
        {
            "data": [_serialize_record(result) for result in results],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": (total + per_page - 1) // per_page if total else 0,
            },
            "filters": {
                "status": status_filter,
                "thickness_min": thickness_min,
                "thickness_max": thickness_max,
                "analyzed_from": analyzed_from_raw,
                "analyzed_to": analyzed_to_raw,
            },
        }
    )


@analysis_blueprint.get("/analyses/<string:record_id>")
def get_analysis(record_id: str):
    try:
        record = StemAnalysis.objects.get(id=record_id)
    except (DoesNotExist, MongoValidationError):
        return _error("Record not found.", 404)

    return jsonify({"data": _serialize_record(record)})


@analysis_blueprint.delete("/analyses/<string:record_id>")
def delete_analysis(record_id: str):
    try:
        record = StemAnalysis.objects.get(id=record_id)
    except (DoesNotExist, MongoValidationError):
        return _error("Record not found.", 404)

    file_path = Path(current_app.config["UPLOAD_DIR"]) / record.photo_filename
    if file_path.exists():
        try:
            file_path.unlink()
        except PermissionError:
            pass

    record.delete()
    return "", 204
