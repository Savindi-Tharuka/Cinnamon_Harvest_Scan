import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def _as_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    debug: bool
    mongodb_uri: str
    upload_dir: Path
    max_content_length: int


def load_settings() -> Settings:
    upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
    if not upload_dir.is_absolute():
        upload_dir = BASE_DIR / upload_dir

    return Settings(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=_as_bool(os.getenv("FLASK_DEBUG", "0")),
        mongodb_uri=os.getenv(
            "MONGODB_URI", "mongodb://localhost:27017/cinnomon_dev"
        ),
        upload_dir=upload_dir,
        max_content_length=int(os.getenv("MAX_CONTENT_LENGTH", str(10 * 1024 * 1024))),
    )
