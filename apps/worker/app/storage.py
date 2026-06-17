"""Local-volume object storage. Swappable with S3/MinIO later."""
import os
from pathlib import Path

from .config import get_settings


def storage_root() -> Path:
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_asset(relative_path: str, data: bytes) -> str:
    """Write bytes to storage and return the relative URL path."""
    dest = storage_root() / relative_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    # Public URL path (served by web app's /media route)
    base = os.getenv("PUBLIC_MEDIA_BASE_URL", "http://localhost:3000/media")
    return f"{base}/{relative_path}"
