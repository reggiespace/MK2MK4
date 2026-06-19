import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Worker configuration read from the environment."""

    fal_key: str | None = os.getenv("FAL_KEY") or None
    elevenlabs_api_key: str | None = os.getenv("ELEVENLABS_API_KEY") or None
    shared_secret: str = os.getenv("WORKER_SHARED_SECRET", "")
    storage_dir: str = os.getenv("STORAGE_DIR", "./storage")
    fal_image_model: str = os.getenv("FAL_IMAGE_MODEL", "fal-ai/flux/schnell")
    fal_video_model: str = os.getenv("FAL_VIDEO_MODEL", "fal-ai/bytedance/seedance/v1/lite/image-to-video")

    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")  # local | s3
    s3_bucket: str | None = os.getenv("MEDIA_S3_BUCKET") or None
    s3_region: str = os.getenv("MEDIA_S3_REGION", "garage")
    s3_endpoint: str | None = os.getenv("MEDIA_S3_ENDPOINT") or None
    s3_public_base_url: str | None = os.getenv("MEDIA_PUBLIC_BASE_URL") or None
    aws_access_key_id: str | None = os.getenv("AWS_ACCESS_KEY_ID") or None
    aws_secret_access_key: str | None = os.getenv("AWS_SECRET_ACCESS_KEY") or None

    # Brand voices keyed by "<REGION>_<GENDER>" (e.g. "BR_FEMALE", "US_MALE").
    elevenlabs_voices: dict[str, str] = {
        key: val
        for key, val in {
            "BR_MALE": os.getenv("ELEVENLABS_VOICE_ID_BR_MALE"),
            "BR_FEMALE": os.getenv("ELEVENLABS_VOICE_ID_BR_FEMALE"),
            "US_MALE": os.getenv("ELEVENLABS_VOICE_ID_US_MALE"),
            "US_FEMALE": os.getenv("ELEVENLABS_VOICE_ID_US_FEMALE"),
        }.items()
        if val
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
