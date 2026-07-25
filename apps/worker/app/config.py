import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Worker configuration read from the environment."""

    shared_secret: str = os.getenv("WORKER_SHARED_SECRET", "")
    storage_dir: str = os.getenv("STORAGE_DIR", "./storage")

    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")  # local | s3
    s3_bucket: str | None = os.getenv("MEDIA_S3_BUCKET") or None
    s3_region: str = os.getenv("MEDIA_S3_REGION", "garage")
    s3_endpoint: str | None = os.getenv("MEDIA_S3_ENDPOINT") or None
    s3_public_base_url: str | None = os.getenv("MEDIA_PUBLIC_BASE_URL") or None
    aws_access_key_id: str | None = os.getenv("AWS_ACCESS_KEY_ID") or None
    aws_secret_access_key: str | None = os.getenv("AWS_SECRET_ACCESS_KEY") or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
