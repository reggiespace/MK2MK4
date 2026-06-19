"""Media-quality probes used by the host step to reject broken/empty assets."""
from __future__ import annotations

import io
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

class MediaQualityError(Exception):
    """Raised when a rendered asset fails a quality gate."""

def probe_image(data: bytes, *, min_w: int, min_h: int, min_stddev: float = 3.0) -> dict[str, Any]:
    """Validate an image is non-blank and at least min_w x min_h. Returns meta."""
    if not data:
        raise MediaQualityError("image is empty")
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if w < min_w or h < min_h:
        raise MediaQualityError(f"image too small: {w}x{h} < {min_w}x{min_h}")
    # Blank detection: a near-black, low-variance downscaled grayscale sample
    # indicates a failed/empty render. A flat *non-dark* color (e.g. a solid
    # brand-color background) is legitimate and must not be rejected, so we
    # only flag low-variance frames that are also near-black on average.
    stat = img.resize((64, 64)).convert("L")
    px = list(stat.getdata())
    mean = sum(px) / len(px)
    var = sum((p - mean) ** 2 for p in px) / len(px)
    if mean < 8.0 and var ** 0.5 < min_stddev:
        raise MediaQualityError("image appears blank (near-black, low variance)")
    return {"width": w, "height": h}

def _ffprobe(path: Path) -> dict[str, Any]:
    res = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        check=True, capture_output=True,
    )
    return json.loads(res.stdout or "{}")

def probe_video(data: bytes, *, require_audio: bool = True) -> dict[str, Any]:
    """Validate a video has a video stream (and audio if required) and non-zero
    duration. Returns meta {width, height, durationMs, hasAudio}."""
    if not data:
        raise MediaQualityError("video is empty")
    with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
        tmp.write(data)
        tmp.flush()
        info = _ffprobe(Path(tmp.name))
    streams = info.get("streams", [])
    vid = next((s for s in streams if s.get("codec_type") == "video"), None)
    aud = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if vid is None:
        raise MediaQualityError("no video stream")
    dur_ms = int(float(info.get("format", {}).get("duration", 0)) * 1000)
    if dur_ms <= 0:
        raise MediaQualityError("video has zero duration")
    if require_audio and aud is None:
        raise MediaQualityError("no audio stream")
    return {
        "width": int(vid.get("width", 0)),
        "height": int(vid.get("height", 0)),
        "durationMs": dur_ms,
        "hasAudio": aud is not None,
    }
