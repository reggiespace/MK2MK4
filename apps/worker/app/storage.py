"""Object storage: local volume (dev) or Garage S3 (prod), chosen by config."""
import os
from pathlib import Path

from .config import get_settings
from .storage_s3 import upload_and_verify


def storage_root() -> Path:
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _save_local(relative_path: str, data: bytes) -> str:
    dest = storage_root() / relative_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    base = os.getenv("PUBLIC_MEDIA_BASE_URL", "http://localhost:3000/media")
    return f"{base}/{relative_path}"


def save_asset(relative_path: str, data: bytes) -> str:
    """Persist bytes and return a publicly fetchable URL."""
    if get_settings().storage_backend == "s3":
        return upload_and_verify(relative_path, data)
    return _save_local(relative_path, data)
