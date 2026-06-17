"""fal.ai image generation + image-to-video, with on-disk caching.

Returns None on any failure so callers can fall back to the flat-card /
Ken-Burns paths. Never raises into the render pipeline.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("worker.imagery")


def _cache_dir() -> Path:
    d = Path(get_settings().storage_dir) / "cache" / "img"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _key(art_direction: str, prompt: str, size: tuple[int, int], seed: int | None) -> str:
    raw = f"{art_direction}|{prompt}|{size[0]}x{size[1]}"
    if seed is not None:
        raw += f"|seed{seed}"
    return hashlib.sha256(raw.encode()).hexdigest()


def piece_seed(piece_id: str) -> int:
    """Stable per-piece seed so re-renders reproduce the same imagery."""
    return int(hashlib.sha256(piece_id.encode()).hexdigest()[:8], 16)


def _download(url: str) -> bytes:
    return httpx.get(url, timeout=60).content


def _fal_image(prompt: str, model: str, size: tuple[int, int], seed: int | None) -> bytes:
    """Call fal.ai text-to-image and return PNG/JPEG bytes."""
    import fal_client

    w, h = size
    args: dict = {"prompt": prompt, "image_size": {"width": w, "height": h}, "num_images": 1}
    if seed is not None:
        args["seed"] = seed
    result = fal_client.subscribe(model, arguments=args)
    return _download(result["images"][0]["url"])


def generate_background(
    prompt: str,
    art_direction: str,
    size: tuple[int, int],
    api_key: str | None,
    seed: int | None = None,
) -> bytes | None:
    """Return a generated background image (bytes) or None on failure/no key."""
    if not api_key:
        log.info("no FAL_KEY; skipping image generation")
        return None

    cache_dir = _cache_dir()
    cache_path = cache_dir / f"{_key(art_direction, prompt, size, seed)}.png"
    if cache_path.exists():
        return cache_path.read_bytes()

    try:
        data = _fal_image(prompt, get_settings().fal_image_model, size, seed)
        cache_path.write_bytes(data)
        return data
    except Exception as exc:  # never break the pipeline
        log.error("fal image generation failed: %s", exc)
        return None
