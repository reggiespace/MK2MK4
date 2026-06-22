import io
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from app.quality import probe_image, probe_video, MediaQualityError

def _png_bytes(w=1080, h=1350, color=(110, 165, 71)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def test_probe_image_returns_dimensions():
    meta = probe_image(_png_bytes(), min_w=1000, min_h=1000)
    assert meta["width"] == 1080 and meta["height"] == 1350

def test_probe_image_rejects_blank():
    with pytest.raises(MediaQualityError):
        probe_image(_png_bytes(color=(0, 0, 0)), min_w=1000, min_h=1000)

def test_probe_image_rejects_too_small():
    with pytest.raises(MediaQualityError):
        probe_image(_png_bytes(w=200, h=200), min_w=1000, min_h=1000)

def test_probe_video_requires_streams(tmp_path: Path):
    # 1s 1080x1920 test video WITH audio via ffmpeg lavfi
    out = tmp_path / "v.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=green:s=1080x1920:d=1",
         "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
        check=True, capture_output=True,
    )
    meta = probe_video(out.read_bytes(), require_audio=True)
    assert meta["width"] == 1080 and meta["height"] == 1920
    assert meta["durationMs"] >= 800 and meta["hasAudio"] is True
