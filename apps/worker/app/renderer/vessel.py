"""Vessel design-system Pillow renderer.

Renders slides to PNG using the three Gastric IQ skins:
  light       — cream background, dark ink
  dark        — dark background, cream ink
  mark_forward — slate→moss gradient, cream ink

Font loading: looks for TTF files in assets/fonts/ relative to the monorepo root.
Falls back to Pillow's built-in default if fonts are not present (dev mode).
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Token tables — mirrors globals.css and seed.ts BrandKit tokens
# ---------------------------------------------------------------------------
SKINS: dict[str, dict[str, Any]] = {
    "light": {
        "bg": (236, 230, 214),       # #ECE6D6 cream
        "fg": (26, 34, 48),          # #1A2230 ink
        "accent": (92, 117, 86),     # #5C7556 moss
        "muted": (110, 105, 82),     # #6E6952
        "gradient": None,
    },
    "dark": {
        "bg": (14, 20, 27),          # #0E141B
        "fg": (229, 222, 204),       # #E5DECC
        "accent": (148, 174, 138),   # #94AE8A moss-dark
        "muted": (140, 150, 160),
        "gradient": None,
    },
    "mark_forward": {
        "bg": (59, 90, 120),         # #3B5A78 slate (gradient start)
        "fg": (236, 230, 214),       # #ECE6D6
        "accent": (180, 210, 170),   # lighter moss
        "muted": (180, 195, 210),
        "gradient": ((59, 90, 120), (92, 117, 86)),  # slate → moss
    },
}

# Canvas sizes
SQUARE_SIZE = (1080, 1080)   # IG square
PORTRAIT_SIZE = (1080, 1350)  # IG portrait / carousel

ASSETS_ROOT = (
    Path(os.environ["ASSETS_ROOT"])
    if "ASSETS_ROOT" in os.environ
    else Path(__file__).parents[4] / "assets"
)
FONTS_DIR = ASSETS_ROOT / "fonts"


def _load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        FONTS_DIR / f"{name}-Regular.ttf",
        FONTS_DIR / f"{name}.ttf",
        FONTS_DIR / f"{name}-Bold.ttf",
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    # fallback — Pillow default bitmap font (no sizing)
    return ImageFont.load_default(size=size)


def _gradient_background(size: tuple[int, int], colors: tuple[tuple, tuple]) -> Image.Image:
    """Create a linear gradient from top-left to bottom-right."""
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    w, h = size
    c1, c2 = colors
    for y in range(h):
        t = y / h
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def _cover_fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale + center-crop an image to exactly fill size."""
    tw, th = size
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def _text_scrim(size: tuple[int, int]) -> Image.Image:
    """Bottom-up dark gradient so text stays legible over any photo."""
    w, h = size
    scrim = Image.new("RGBA", size, (0, 0, 0, 0))
    px = scrim.load()
    for y in range(h):
        t = y / h
        alpha = int(200 * max(0.0, (t - 0.35) / 0.65))  # ramp from 35% down
        for x in range(w):
            px[x, y] = (8, 12, 18, alpha)
    return scrim


def _wrap_text(text: str, font: Any, max_width: int, draw: ImageDraw.ImageDraw) -> list[str]:
    """Wrap text to fit within max_width pixels."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def render_slide(
    *,
    skin: str,
    role: str,
    eyebrow: str | None,
    headline: str | None,
    body: str | None,
    logo_path: str | None = None,
    background_image: bytes | None = None,
    size: tuple[int, int] = PORTRAIT_SIZE,
) -> bytes:
    """Render a single slide to PNG bytes."""
    skin_tokens = SKINS.get(skin, SKINS["dark"])

    # Background
    if background_image:
        base = Image.open(io.BytesIO(background_image)).convert("RGB")
        img = _cover_fit(base, size).convert("RGB")
        img = Image.alpha_composite(img.convert("RGBA"), _text_scrim(size)).convert("RGB")
    elif skin_tokens["gradient"]:
        img = _gradient_background(size, skin_tokens["gradient"])
    else:
        img = Image.new("RGB", size, skin_tokens["bg"])

    draw = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.08)
    content_w = w - pad * 2

    fg = skin_tokens["fg"]
    accent = skin_tokens["accent"]
    muted = skin_tokens["muted"]

    # Fonts
    font_eyebrow = _load_font("IBMPlexMono", 28)
    font_headline = _load_font("Spectral", 72 if role == "cover" else 56)
    font_body = _load_font("AlbertSans", 36)

    # Layout: bottom-anchored text block
    y = h - pad

    # Body text (bottom-most)
    if body:
        lines = _wrap_text(body, font_body, content_w, draw)
        for line in reversed(lines):
            bbox = draw.textbbox((0, 0), line, font=font_body)
            line_h = bbox[3] - bbox[1]
            y -= line_h + 6
            draw.text((pad, y), line, font=font_body, fill=(*muted, 255))
        y -= 24  # gap before headline

    # Headline
    if headline:
        lines = _wrap_text(headline, font_headline, content_w, draw)
        for line in reversed(lines):
            bbox = draw.textbbox((0, 0), line, font=font_headline)
            line_h = bbox[3] - bbox[1]
            y -= line_h + 8
            draw.text((pad, y), line, font=font_headline, fill=(*fg, 255))
        y -= 20

    # Eyebrow
    if eyebrow:
        eyebrow_upper = eyebrow.upper()
        bbox = draw.textbbox((0, 0), eyebrow_upper, font=font_eyebrow)
        ey_h = bbox[3] - bbox[1]
        y -= ey_h
        draw.text((pad, y), eyebrow_upper, font=font_eyebrow, fill=(*accent, 255))
        y -= 12  # gap above eyebrow (accent bar)

    # Accent bar (thin line above eyebrow area)
    bar_y = y
    draw.rectangle([pad, bar_y - 4, pad + 48, bar_y], fill=(*accent, 255))

    # Logo (top-left, if provided)
    if logo_path and Path(logo_path).exists():
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo_h = int(h * 0.065)
            logo_w = int(logo.width * logo_h / logo.height)
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
            # Place at top-left with padding
            img.paste(logo, (pad, pad), logo)
        except Exception:
            pass

    # Slide number pill (cover only)
    if role == "cover":
        pill_text = "01"
        bbox = draw.textbbox((0, 0), pill_text, font=font_eyebrow)
        pill_w = bbox[2] - bbox[0] + 24
        pill_h = bbox[3] - bbox[1] + 12
        pill_x = w - pad - pill_w
        pill_y = pad
        draw.rounded_rectangle(
            [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
            radius=pill_h // 2,
            fill=(*accent, 80),
        )
        draw.text(
            (pill_x + 12, pill_y + 6),
            pill_text,
            font=font_eyebrow,
            fill=(*fg, 200),
        )

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
