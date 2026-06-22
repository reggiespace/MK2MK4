"""Garage (S3-compatible) object storage: path-style upload + public-URL verify."""
from __future__ import annotations

import httpx

from .config import get_settings

_EXT_CT = {
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
}

def content_type_for(key: str) -> str:
    for ext, ct in _EXT_CT.items():
        if key.lower().endswith(ext):
            return ct
    return "application/octet-stream"

def build_public_url(*, endpoint: str, bucket: str, key: str, public_base: str | None) -> str:
    if public_base:
        return f"{public_base.rstrip('/')}/{key.lstrip('/')}"
    return f"{endpoint.rstrip('/')}/{bucket}/{key.lstrip('/')}"

_client_cache = None

def _client():
    global _client_cache
    if _client_cache is None:
        import boto3
        from botocore.config import Config

        s = get_settings()
        _client_cache = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint,
            region_name=s.s3_region,
            aws_access_key_id=s.aws_access_key_id,
            aws_secret_access_key=s.aws_secret_access_key,
            config=Config(s3={"addressing_style": "path"}),
        )
    return _client_cache

def upload_and_verify(key: str, data: bytes) -> str:
    """PUT object public-read, then GET its public URL to confirm 200 +
    content-type. Returns the public URL. Raises on failure."""
    s = get_settings()
    if not (s.s3_bucket and s.s3_endpoint):
        raise RuntimeError("S3 storage selected but MEDIA_S3_BUCKET/ENDPOINT unset")
    ct = content_type_for(key)
    client = _client()
    try:
        client.put_object(
            Bucket=s.s3_bucket, Key=key, Body=data,
            ContentType=ct, ACL="public-read",
        )
    except Exception as exc:
        raise RuntimeError(f"S3 put_object failed for key={key}: {exc}") from exc
    url = build_public_url(
        endpoint=s.s3_endpoint, bucket=s.s3_bucket, key=key,
        public_base=s.s3_public_base_url,
    )
    try:
        resp = httpx.get(url, timeout=15, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"public URL verify request failed for {url}: {exc}") from exc
    if resp.status_code != 200:
        raise RuntimeError(f"public URL verify failed: {resp.status_code} for {url}")
    got_ct = resp.headers.get("content-type", "").split(";")[0].strip()
    if got_ct != ct:
        raise RuntimeError(f"content-type mismatch: expected {ct}, got {got_ct!r}")
    return url
