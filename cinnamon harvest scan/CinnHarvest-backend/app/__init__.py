import os

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
from mongoengine import connect

from app.api import analysis_blueprint
from app.config import BASE_DIR, load_settings
from app.ml_pipeline import warmup_pipeline


def create_app() -> Flask:
    load_dotenv(BASE_DIR / ".env")
    settings = load_settings()

    app = Flask(__name__)
    app.config.update(
        DEBUG=settings.debug,
        HOST=settings.host,
        PORT=settings.port,
        UPLOAD_DIR=str(settings.upload_dir),
        MAX_CONTENT_LENGTH=settings.max_content_length,
    )

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    connect(host=settings.mongodb_uri, alias="default")
    if os.getenv("ML_WARMUP_ON_STARTUP", "1").strip().lower() in {"1", "true", "yes", "on"}:
        warmup_pipeline(app.logger)

    app.register_blueprint(analysis_blueprint, url_prefix="/api/v1")

    @app.get("/")
    def index():
        return jsonify({"message": "Flask API is running"})

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok", "service": "flask-api"})

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename: str):
        return send_from_directory(app.config["UPLOAD_DIR"], filename)

    return app
