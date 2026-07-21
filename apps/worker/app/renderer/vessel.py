"""Vessel design-system Pillow renderer.

Renders slides to PNG. Three axes of control:

  skin      — colour palette: light | dark | mark_forward
  template  — layout system:
                classic          (legacy bottom-anchored text; kept for tests)
                editorial_bold   (serif editorial: big headline, kicker rule, footer)
                bold_highlight   (text-forward: knockout highlight on the punchline)
                minimal_card     (calm, lots of whitespace, one idea per card)
                photo_overlay    (lifestyle photo + scrim + refined type)
  transparent — when True, the four designed templates draw on a see-through
                canvas (bottom scrim only) instead of painting their own
                background, so the AI-motion reel path can composite them
                over an already-animated fal.ai video clip.

CTA slides (role="cta") additionally get a fixed, renderer-owned link pill +
compliance disclaimer (localized by `locale`) — never LLM-authored, since
that copy is compliance-critical.

Font loading looks for TTFs in assets/fonts/ relative to the monorepo root and
falls back to Pillow's default when they are missing (dev mode).
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Token tables — mirrors globals.css and seed.ts BrandKit tokens
# ---------------------------------------------------------------------------
SKINS: dict[str, dict[str, Any]] = {
    "light": {
        "bg": (236, 230, 214),       # #ECE6D6 cream
        "fg": (26, 34, 48),          # #1A2230 ink
        "accent": (92, 117, 86),     # #5C7556 moss
        "brass": (168, 132, 72),     # #A88448 brass
        "muted": (110, 105, 82),     # #6E6952
        "gradient": None,            # (classic) flat card
        "grad": [(0.0, (240, 235, 223)), (1.0, (226, 218, 198))],
    },
    "dark": {
        "bg": (14, 20, 27),          # #0E141B
        "fg": (229, 222, 204),       # #E5DECC
        "accent": (148, 174, 138),   # #94AE8A moss-dark
        "brass": (201, 164, 114),    # #C9A472
        "muted": (150, 160, 170),
        "gradient": None,
        "grad": [(0.0, (16, 23, 31)), (0.55, (21, 30, 41)), (1.0, (13, 18, 25))],
    },
    "mark_forward": {
        "bg": (59, 90, 120),         # #3B5A78 slate
        "fg": (236, 230, 214),       # #ECE6D6
        "accent": (183, 213, 170),   # lighter moss
        "brass": (201, 164, 114),
        "muted": (196, 209, 222),
        "gradient": ((59, 90, 120), (92, 117, 86)),  # (classic) slate → moss
        "grad": [(0.0, (58, 88, 118)), (0.5, (47, 93, 99)), (1.0, (92, 117, 86))],
    },
}

# Canvas sizes
SQUARE_SIZE = (1080, 1080)   # IG square
PORTRAIT_SIZE = (1080, 1350)  # IG portrait / carousel
STORY_SIZE = (1080, 1920)    # IG/FB story (9:16)

ASSETS_ROOT = (
    Path(os.environ["ASSETS_ROOT"])
    if "ASSETS_ROOT" in os.environ
    else Path(__file__).parents[4] / "assets"
)
FONTS_DIR = ASSETS_ROOT / "fonts"


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------
def _load_font(name: str, size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        FONTS_DIR / f"{name}-{weight}.ttf",
        FONTS_DIR / f"{name}.ttf",
        FONTS_DIR / f"{name}-Regular.ttf",
        FONTS_DIR / f"{name}-Bold.ttf",
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def _mix(c1: tuple, c2: tuple, t: float) -> tuple[int, int, int]:
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))  # type: ignore[return-value]


def _gradient_background(size: tuple[int, int], colors: tuple[tuple, tuple]) -> Image.Image:
    """Legacy 2-stop linear gradient (classic template)."""
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    w, h = size
    c1, c2 = colors
    for y in range(h):
        draw.line([(0, y), (w, y)], fill=_mix(c1, c2, y / max(1, h - 1)))
    return img


def _multistop_gradient(size: tuple[int, int], stops: list) -> Image.Image:
    """Vertical gradient through an ordered list of (pos 0..1, rgb) stops."""
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)

    def color_at(t: float) -> tuple[int, int, int]:
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                f = (t - p0) / (p1 - p0) if p1 > p0 else 0.0
                return _mix(c0, c1, f)
        return stops[-1][1]

    for y in range(h):
        draw.line([(0, y), (w, y)], fill=color_at(y / max(1, h - 1)))
    return img


def _apply_grain(img: Image.Image, strength: float = 0.16) -> Image.Image:
    """Subtle film grain for depth (soft-light blend of gaussian noise)."""
    noise = Image.effect_noise(img.size, 22).convert("RGB")
    blended = ImageChops.soft_light(img.convert("RGB"), noise)
    return Image.blend(img.convert("RGB"), blended, strength)


def _soft_circle(size: tuple[int, int], center: tuple[int, int], radius: int,
                 color: tuple[int, int, int], alpha: int) -> Image.Image:
    """A blurred translucent disc, returned as an RGBA layer to composite."""
    from PIL import ImageFilter
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
              fill=(*color, alpha))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.35))


def _cover_fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def _text_scrim(size: tuple[int, int], start: float = 0.35, strength: int = 200) -> Image.Image:
    w, h = size
    scrim = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(scrim)
    for y in range(h):
        t = y / h
        alpha = int(strength * max(0.0, (t - start) / max(1e-6, (1 - start))))
        d.line([(0, y), (w, y)], fill=(8, 12, 18, alpha))
    return scrim


def _wrap_text(text: str, font: Any, max_width: int, draw: ImageDraw.ImageDraw,
               tracking: float = 0.0) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        if _measure_tracked(draw, test, font, tracking) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _measure_tracked(draw: ImageDraw.ImageDraw, text: str, font: Any, tracking: float = 0.0) -> float:
    if not text:
        return 0.0
    return sum(draw.textlength(ch, font=font) + tracking for ch in text) - tracking


def _draw_tracked(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: Any,
                  fill: tuple, tracking: float = 0.0) -> float:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x - xy[0]


def _line_height(draw: ImageDraw.ImageDraw, font: Any) -> int:
    bbox = draw.textbbox((0, 0), "Ag", font=font)
    return bbox[3] - bbox[1]


def _fit_headline(text: str, font_name: str, weight: str, start_size: int, min_size: int,
                  max_lines: int, content_w: int, draw: ImageDraw.ImageDraw,
                  transform: Any = None) -> tuple[Any, list[str]]:
    """Shrink a headline font until it wraps within max_lines (AI captions vary
    a lot in length; a fixed size overflows the canvas on longer headlines)."""
    size = start_size
    while size > min_size:
        font = _load_font(font_name, size, weight=weight)
        candidate = transform(text) if transform else text
        lines = _wrap_text(candidate, font, content_w, draw)
        if len(lines) <= max_lines:
            return font, lines
        size -= 4
    font = _load_font(font_name, min_size, weight=weight)
    candidate = transform(text) if transform else text
    return font, _wrap_text(candidate, font, content_w, draw)


def _paste_logo(img: Image.Image, draw: ImageDraw.ImageDraw, logo_path: str | None,
                skin: str, x: int, y: int, h: int, chip: bool) -> None:
    if not (logo_path and Path(logo_path).exists()):
        return
    try:
        logo = Image.open(logo_path).convert("RGBA")
        lw = int(logo.width * h / logo.height)
        logo = logo.resize((lw, h), Image.LANCZOS)
        if chip:
            cp = 16
            draw.rounded_rectangle([x - cp, y - cp, x + lw + cp, y + h + cp],
                                   radius=20, fill=(236, 230, 214))
        img.paste(logo, (x, y), logo)
    except Exception:
        pass


def _footer(img: Image.Image, draw: ImageDraw.ImageDraw, size: tuple[int, int], pad: int,
            handle: str | None, index: int, total: int, mono: Any,
            fg: tuple, muted: tuple, rule: bool = True) -> None:
    w, h = size
    fy = h - int(pad * 0.72)
    if rule:
        draw.line([(pad, fy - 22), (w - pad, fy - 22)], fill=(*muted, 255), width=2)
    if handle:
        _draw_tracked(draw, (pad, fy), handle, mono, (*fg, 235), tracking=1.0)
    counter = f"{index + 1:02d} / {total:02d}"
    cw = _measure_tracked(draw, counter, mono, 1.0)
    _draw_tracked(draw, (w - pad - int(cw), fy), counter, mono, (*muted, 235), tracking=1.0)


def _progress_bar(img: Image.Image, size: tuple[int, int], pad: int, index: int, total: int,
                  fg: tuple, muted: tuple) -> None:
    w, h = size
    total = max(1, total)
    gap = 10
    seg_w = (w - pad * 2 - gap * (total - 1)) / total
    y = int(h * 0.032)
    d = ImageDraw.Draw(img)
    for i in range(total):
        x0 = pad + i * (seg_w + gap)
        d.rounded_rectangle([x0, y, x0 + seg_w, y + 7], radius=3,
                            fill=(*(fg if i <= index else muted),))


# ---------------------------------------------------------------------------
# Template: classic  (legacy — preserved for reels/tests, do not restyle)
# ---------------------------------------------------------------------------
def _render_classic(skin: str, role: str, eyebrow: str | None, headline: str | None,
                    body: str | None, logo_path: str | None, background_image: bytes | None,
                    transparent: bool, size: tuple[int, int]) -> Image.Image:
    skin_tokens = SKINS.get(skin, SKINS["dark"])

    if transparent:
        img = Image.new("RGBA", size, (0, 0, 0, 0))
        img = Image.alpha_composite(img, _text_scrim(size))
    elif background_image:
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
    fg, accent, muted = skin_tokens["fg"], skin_tokens["accent"], skin_tokens["muted"]

    font_eyebrow = _load_font("IBMPlexMono", 28)
    font_headline = _load_font("Spectral", 72 if role == "cover" else 56)
    font_body = _load_font("AlbertSans", 36)

    y = h - pad
    if body:
        for line in reversed(_wrap_text(body, font_body, content_w, draw)):
            bbox = draw.textbbox((0, 0), line, font=font_body)
            y -= (bbox[3] - bbox[1]) + 6
            draw.text((pad, y), line, font=font_body, fill=(*muted, 255))
        y -= 24
    if headline:
        for line in reversed(_wrap_text(headline, font_headline, content_w, draw)):
            bbox = draw.textbbox((0, 0), line, font=font_headline)
            y -= (bbox[3] - bbox[1]) + 8
            draw.text((pad, y), line, font=font_headline, fill=(*fg, 255))
        y -= 20
    if eyebrow:
        eu = eyebrow.upper()
        bbox = draw.textbbox((0, 0), eu, font=font_eyebrow)
        y -= (bbox[3] - bbox[1])
        draw.text((pad, y), eu, font=font_eyebrow, fill=(*accent, 255))
        y -= 12
    draw.rectangle([pad, y - 4, pad + 48, y], fill=(*accent, 255))

    if logo_path and Path(logo_path).exists():
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo_h = int(h * 0.065)
            logo_w = int(logo.width * logo_h / logo.height)
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
            if skin == "dark":
                cp = 16
                draw.rounded_rectangle([pad - cp, pad - cp, pad + logo_w + cp, pad + logo_h + cp],
                                       radius=20, fill=(236, 230, 214))
            img.paste(logo, (pad, pad), logo)
        except Exception:
            pass

    if role == "cover":
        pill = "01"
        bbox = draw.textbbox((0, 0), pill, font=font_eyebrow)
        pw, ph = bbox[2] - bbox[0] + 24, bbox[3] - bbox[1] + 12
        px, py = w - pad - pw, pad
        draw.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=(*accent, 80))
        draw.text((px + 12, py + 6), pill, font=font_eyebrow, fill=(*fg, 200))

    return img


# ---------------------------------------------------------------------------
# Shared background for the new templates
# ---------------------------------------------------------------------------
def _designed_background(skin: str, size: tuple[int, int], background_image: bytes | None,
                         scrim: bool) -> Image.Image:
    tok = SKINS.get(skin, SKINS["dark"])
    if background_image:
        base = _cover_fit(Image.open(io.BytesIO(background_image)).convert("RGB"), size)
        if scrim:
            base = Image.alpha_composite(base.convert("RGBA"), _text_scrim(size, 0.3, 210)).convert("RGB")
        return base
    img = _multistop_gradient(size, tok["grad"])
    # soft off-canvas accent glow for depth
    glow = _soft_circle(size, (int(size[0] * 0.82), int(size[1] * 0.16)),
                        int(size[0] * 0.42), tok["accent"], 34)
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    return _apply_grain(img)


def _base_canvas(template: str, skin: str, size: tuple[int, int],
                 background_image: bytes | None, transparent: bool) -> Image.Image:
    """Starting RGBA canvas for a designed template.

    Opaque mode paints the template's own background (photo/gradient/flat).
    Transparent mode (AI-motion reels) returns a see-through canvas with a
    bottom scrim so type stays legible over arbitrary video underneath.
    """
    if transparent:
        img = Image.new("RGBA", size, (0, 0, 0, 0))
        return Image.alpha_composite(img, _text_scrim(size, 0.28, 225))
    if template == "minimal_card":
        tok = SKINS.get(skin, SKINS["dark"])
        return _apply_grain(Image.new("RGB", size, tok["bg"]), strength=0.06).convert("RGBA")
    if template == "photo_overlay":
        img = _designed_background(skin, size, background_image, scrim=True)
        return Image.alpha_composite(img.convert("RGBA"), _text_scrim(size, 0.45, 190))
    # editorial_bold, bold_highlight
    return _designed_background(skin, size, background_image, scrim=False).convert("RGBA")


# ---------------------------------------------------------------------------
# CTA footer: fixed, renderer-owned link pill + compliance disclaimer.
# Never LLM-authored — this copy is compliance-critical and localized here.
# ---------------------------------------------------------------------------
CTA_COPY = {
    "en": {
        "pill": "Free on Google Play  ·  gastric-iq.com",
        "disclaimer": "Educational — not medical advice.",
    },
    "pt_BR": {
        "pill": "Grátis no Google Play  ·  gastric-iq.com",
        "disclaimer": "Conteúdo educativo — não substitui orientação médica.",
    },
}


def _cta_footer_metrics(draw: ImageDraw.ImageDraw, content_w: int, locale: str):
    copy = CTA_COPY.get(locale, CTA_COPY["en"])
    f_pill = _load_font("IBMPlexMono", int(content_w * 0.028))
    f_disclaimer = _load_font("AlbertSans", int(content_w * 0.024))
    pill_h = int(f_pill.size * 2.15)
    lines = _wrap_text(copy["disclaimer"], f_disclaimer, content_w, draw)
    line_h = int(_line_height(draw, f_disclaimer) * 1.4)
    height = pill_h + int(pill_h * 0.45) + len(lines) * line_h
    return copy, f_pill, f_disclaimer, pill_h, lines, line_h, height


def _cta_footer_height(draw: ImageDraw.ImageDraw, content_w: int, locale: str) -> int:
    return _cta_footer_metrics(draw, content_w, locale)[-1]


def _draw_cta_footer(draw: ImageDraw.ImageDraw, pad: int, y: int, content_w: int, locale: str,
                     fg: tuple, accent: tuple, muted: tuple) -> int:
    """Draw the link pill + disclaimer top-down starting at y; returns new y."""
    copy, f_pill, f_disclaimer, pill_h, lines, line_h, _ = _cta_footer_metrics(draw, content_w, locale)
    pill_text = copy["pill"]
    tw = draw.textlength(pill_text, font=f_pill)
    pill_pad_x = 26
    pill_w = int(tw) + pill_pad_x * 2
    draw.rounded_rectangle([pad, y, pad + pill_w, y + pill_h], radius=pill_h // 2,
                           outline=(*accent, 255), width=3)
    draw.text((pad + pill_pad_x, y + (pill_h - f_pill.size) // 2 - 4), pill_text,
             font=f_pill, fill=(*fg, 255))
    y += pill_h + int(pill_h * 0.45)
    for line in lines:
        draw.text((pad, y), line, font=f_disclaimer, fill=(*muted, 220))
        y += line_h
    return y


# ---------------------------------------------------------------------------
# Template: editorial_bold
# ---------------------------------------------------------------------------
def _render_editorial_bold(img, skin, role, eyebrow, headline, body, logo_path,
                          size, handle, slide_index, slide_total, is_story,
                          locale, overlay) -> None:
    tok = SKINS.get(skin, SKINS["dark"])
    draw = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.085)
    content_w = w - pad * 2
    if overlay:
        fg, accent, brass, muted = (240, 236, 226), tok["accent"], tok["brass"], (205, 212, 216)
    else:
        fg, accent, brass, muted = tok["fg"], tok["accent"], tok["brass"], tok["muted"]

    f_kicker = _load_font("IBMPlexMono", 27)
    max_hsize = int(w * (0.098 if role == "cover" else 0.078))
    min_hsize = int(w * 0.05)
    f_body = _load_font("AlbertSans", int(w * 0.036))

    top = int(h * (0.11 if is_story else 0.14))
    if is_story:
        _progress_bar(img, size, pad, slide_index, slide_total, fg, muted)
    _paste_logo(img, draw, logo_path, skin, pad, top, int(h * 0.055), chip=(skin == "dark"))

    # Anchor the text block in the vertical middle-lower third. Headline font
    # shrinks to fit — AI-generated headlines vary a lot in length.
    if headline:
        f_head, head_lines = _fit_headline(headline, "Spectral", "Bold", max_hsize, min_hsize,
                                           4, content_w, draw)
        lh_head = int(f_head.size * 1.12)
    else:
        f_head, head_lines, lh_head = None, [], 0
    body_lines = _wrap_text(body, f_body, content_w, draw) if body else []
    lh_body = int(_line_height(draw, f_body) * 1.45)
    block_h = (len(head_lines) * lh_head) + (28 + len(body_lines) * lh_body if body_lines else 0)

    y = int(h * (0.60 if is_story else 0.58)) - block_h // 2

    # Kicker: rule + tracked mono label
    if eyebrow:
        ky = y - int(h * 0.055)
        draw.rectangle([pad, ky + 12, pad + 54, ky + 16], fill=(*accent, 255))
        _draw_tracked(draw, (pad + 72, ky), eyebrow.upper(), f_kicker, (*accent, 255), tracking=3.0)

    # Headline
    for line in head_lines:
        draw.text((pad, y), line, font=f_head, fill=(*fg, 255))
        y += lh_head
    # brass underline swash under the headline
    if head_lines:
        draw.rounded_rectangle([pad, y + 10, pad + int(content_w * 0.26), y + 20],
                               radius=5, fill=(*brass, 255))
        y += 30

    if body_lines:
        y += 12
        for line in body_lines:
            draw.text((pad, y), line, font=f_body, fill=(*muted, 255))
            y += lh_body

    if role == "cta":
        y += 20
        _draw_cta_footer(draw, pad, y, content_w, locale, fg, accent, muted)

    _footer(img, draw, size, pad, handle, slide_index, slide_total, f_kicker, fg, muted)


# ---------------------------------------------------------------------------
# Template: bold_highlight  (knockout highlight on the punchline)
# ---------------------------------------------------------------------------
def _render_bold_highlight(img, skin, role, eyebrow, headline, body, logo_path,
                          size, handle, slide_index, slide_total, is_story,
                          locale, overlay) -> None:
    tok = SKINS.get(skin, SKINS["dark"])
    draw = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.08)
    content_w = w - pad * 2
    if overlay:
        fg, accent, brass, muted = (240, 236, 226), tok["accent"], tok["brass"], (205, 212, 216)
    else:
        fg, accent, brass, muted = tok["fg"], tok["accent"], tok["brass"], tok["muted"]
    hi_bg = accent
    hi_fg = (18, 22, 16) if overlay else tok["bg"]

    f_kicker = _load_font("IBMPlexMono", 27)
    max_hsize = int(w * (0.11 if role == "cover" else 0.092))
    min_hsize = int(w * 0.055)
    f_body = _load_font("AlbertSans", int(w * 0.036))

    top = int(h * (0.11 if is_story else 0.13))
    if is_story:
        _progress_bar(img, size, pad, slide_index, slide_total, fg, muted)
    _paste_logo(img, draw, logo_path, skin, pad, top, int(h * 0.05), chip=(skin == "dark"))

    # Uppercase headline, shrunk to fit; last line gets a knockout highlight.
    if headline:
        f_head, lines = _fit_headline(headline, "AlbertSans", "Regular", max_hsize, min_hsize,
                                      4, content_w, draw, transform=str.upper)
        hsize = f_head.size
        stroke = max(1, int(hsize * 0.035))
    else:
        f_head, lines, hsize, stroke = None, [], 0, 0
    lh = int(hsize * 1.16)
    body_lines = _wrap_text(body, f_body, content_w, draw) if body else []
    block_h = len(lines) * lh + (30 + len(body_lines) * int(_line_height(draw, f_body) * 1.45) if body_lines else 0)
    y = int(h * (0.58 if is_story else 0.56)) - block_h // 2

    if eyebrow:
        _draw_tracked(draw, (pad, y - int(h * 0.05)), eyebrow.upper(), f_kicker, (*brass, 255), tracking=3.0)

    for i, line in enumerate(lines):
        last = i == len(lines) - 1
        if last and len(lines) > 0:
            lw = draw.textlength(line, font=f_head)
            draw.rounded_rectangle([pad - 14, y - 6, pad + lw + 20, y + lh - 6],
                                   radius=14, fill=(*hi_bg, 255))
            draw.text((pad, y), line, font=f_head, fill=(*hi_fg, 255))
        else:
            draw.text((pad, y), line, font=f_head, fill=(*fg, 255),
                      stroke_width=stroke, stroke_fill=(*fg, 255))
        y += lh

    if body_lines:
        y += 24
        for line in body_lines:
            draw.text((pad, y), line, font=f_body, fill=(*muted, 255))
            y += int(_line_height(draw, f_body) * 1.45)

    if role == "cta":
        y += 20
        _draw_cta_footer(draw, pad, y, content_w, locale, fg, accent, muted)

    _footer(img, draw, size, pad, handle, slide_index, slide_total, f_kicker, fg, muted)


# ---------------------------------------------------------------------------
# Template: minimal_card
# ---------------------------------------------------------------------------
def _render_minimal_card(img, skin, role, eyebrow, headline, body, logo_path,
                         size, handle, slide_index, slide_total, is_story,
                         locale, overlay) -> None:
    tok = SKINS.get(skin, SKINS["dark"])
    draw = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.11)
    content_w = w - pad * 2
    if overlay:
        # over arbitrary video, force legible light ink regardless of skin
        fg, accent, muted = (240, 236, 226), tok["accent"], (205, 212, 216)
    else:
        fg, accent, muted = tok["fg"], tok["accent"], tok["muted"]

    f_kicker = _load_font("IBMPlexMono", 25)
    max_hsize = int(w * (0.072 if role == "cover" else 0.06))
    min_hsize = int(w * 0.038)
    f_body = _load_font("AlbertSans", int(w * 0.033))

    if is_story:
        _progress_bar(img, size, pad, slide_index, slide_total, fg, muted)

    # small accent dot + kicker near vertical center; headline shrinks to fit.
    if headline:
        f_head, head_lines = _fit_headline(headline, "Spectral", "Regular", max_hsize, min_hsize,
                                           3, content_w, draw)
        hsize = f_head.size
    else:
        head_lines, hsize = [], 0
    body_lines = _wrap_text(body, f_body, content_w, draw) if body else []
    lh = int(hsize * 1.28)
    lh_b = int(_line_height(draw, f_body) * 1.5)
    block_h = len(head_lines) * lh + (30 + len(body_lines) * lh_b if body_lines else 0)
    y = h // 2 - block_h // 2

    if eyebrow:
        ky = y - int(h * 0.06)
        draw.ellipse([pad, ky + 6, pad + 14, ky + 20], fill=(*accent, 255))
        _draw_tracked(draw, (pad + 30, ky), eyebrow.upper(), f_kicker, (*muted, 255), tracking=2.5)

    for line in head_lines:
        draw.text((pad, y), line, font=f_head, fill=(*fg, 255))
        y += lh
    if body_lines:
        y += 14
        for line in body_lines:
            draw.text((pad, y), line, font=f_body, fill=(*muted, 255))
            y += lh_b

    if role == "cta":
        y += 20
        _draw_cta_footer(draw, pad, y, content_w, locale, fg, accent, muted)

    # handle bottom-right only (minimal)
    fy = h - int(pad * 0.7)
    if handle:
        hw = _measure_tracked(draw, handle, f_kicker, 1.5)
        _draw_tracked(draw, (w - pad - int(hw), fy), handle, f_kicker, (*muted, 220), tracking=1.5)


# ---------------------------------------------------------------------------
# Template: photo_overlay
# ---------------------------------------------------------------------------
def _render_photo_overlay(img, skin, role, eyebrow, headline, body, logo_path,
                          size, handle, slide_index, slide_total, is_story,
                          locale, overlay) -> None:
    tok = SKINS.get(skin, SKINS["dark"])
    draw = ImageDraw.Draw(img)
    w, h = size
    pad = int(w * 0.08)
    content_w = w - pad * 2
    fg = (240, 236, 226)
    accent, muted = tok["accent"], (210, 214, 220)

    f_kicker = _load_font("IBMPlexMono", 27)
    max_hsize = int(w * (0.088 if role == "cover" else 0.072))
    min_hsize = int(w * 0.045)
    f_body = _load_font("AlbertSans", int(w * 0.035))

    top = int(h * (0.10 if is_story else 0.09))
    if is_story:
        _progress_bar(img, size, pad, slide_index, slide_total, fg, muted)
    _paste_logo(img, draw, logo_path, skin, pad, top, int(h * 0.05), chip=False)

    # bottom-anchored text; headline shrinks to fit so it never crowds the logo.
    body_lines = _wrap_text(body, f_body, content_w, draw) if body else []
    if headline:
        f_head, head_lines = _fit_headline(headline, "Spectral", "Bold", max_hsize, min_hsize,
                                           3, content_w, draw)
        hsize = f_head.size
    else:
        head_lines, hsize = [], 0
    lh = int(hsize * 1.14)
    lh_b = int(_line_height(draw, f_body) * 1.45)

    y = h - int(pad * 1.15)
    if handle:
        y -= 40
        _draw_tracked(draw, (pad, y), handle, f_kicker, (*fg, 230), tracking=1.0)
        counter = f"{slide_index + 1:02d} / {slide_total:02d}"
        cw = _measure_tracked(draw, counter, f_kicker, 1.0)
        _draw_tracked(draw, (w - pad - int(cw), y), counter, f_kicker, (*muted, 220), tracking=1.0)
        y -= 24
    if role == "cta":
        y -= _cta_footer_height(draw, content_w, locale)
        _draw_cta_footer(draw, pad, y, content_w, locale, fg, accent, muted)
        y -= 20
    for line in reversed(body_lines):
        y -= lh_b
        draw.text((pad, y), line, font=f_body, fill=(*muted, 255))
    if body_lines:
        y -= 16
    for line in reversed(head_lines):
        y -= lh
        draw.text((pad, y), line, font=f_head, fill=(*fg, 255))
    if eyebrow:
        y -= int(h * 0.02)
        draw.rectangle([pad, y + 6, pad + 48, y + 10], fill=(*accent, 255))
        _draw_tracked(draw, (pad + 66, y - 6), eyebrow.upper(), f_kicker, (*accent, 255), tracking=3.0)


TEMPLATES = {
    "editorial_bold": _render_editorial_bold,
    "bold_highlight": _render_bold_highlight,
    "minimal_card": _render_minimal_card,
    "photo_overlay": _render_photo_overlay,
}


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------
def render_slide(
    *,
    skin: str,
    role: str,
    eyebrow: str | None,
    headline: str | None,
    body: str | None,
    logo_path: str | None = None,
    background_image: bytes | None = None,
    transparent: bool = False,
    size: tuple[int, int] = PORTRAIT_SIZE,
    template: str = "classic",
    handle: str | None = None,
    slide_index: int = 0,
    slide_total: int = 1,
    locale: str = "en",
) -> bytes:
    """Render a single slide to PNG bytes.

    `template` selects the layout system. `classic` (default) keeps the legacy
    look regardless of `transparent`. The four designed templates support
    both opaque frames (Ken Burns reels, carousels, stories, singles) and
    `transparent=True` (AI-motion reels: composited over an animated fal.ai
    clip) — in the latter they paint only a bottom scrim + type, not their
    own background. `locale` selects the CTA card's fixed link-pill/
    disclaimer copy for role="cta" slides.
    """
    if template == "classic" or template not in TEMPLATES:
        img = _render_classic(skin, role, eyebrow, headline, body, logo_path,
                              background_image, transparent, size)
    else:
        is_story = size[1] >= 1700
        img = _base_canvas(template, skin, size, background_image, transparent)
        TEMPLATES[template](
            img, skin, role, eyebrow, headline, body, logo_path,
            size, handle, slide_index, slide_total, is_story,
            locale, transparent,
        )

    out = io.BytesIO()
    if transparent:
        img.save(out, format="PNG")
    else:
        img.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
