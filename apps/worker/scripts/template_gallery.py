"""Render a contact sheet of every template so a human can pick.

Usage: python scripts/template_gallery.py [out_dir]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.renderer.vessel import render_slide, PORTRAIT_SIZE, STORY_SIZE, TEMPLATES  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/giq-gallery")
OUT.mkdir(parents=True, exist_ok=True)
LOGO = str(Path(__file__).resolve().parents[2] / "assets" / "brands" / "logo-iq-transparent.png")

# A representative 3-slide story sample (EN) — cover, body, cta.
SAMPLE = {
    "en": [
        {"role": "cover", "eyebrow": "Medication cycle", "headline": "The cycle peaks, then it fades", "body": None},
        {"role": "body", "eyebrow": "Day 4-5", "headline": "Food noise can quietly return", "body": "Often expected as the effect dips — not a willpower failure."},
        {"role": "cta", "eyebrow": "Free forever", "headline": "See where you are in your cycle", "body": None},
    ],
}

# skin per template that looks best
SKIN_FOR = {
    "editorial_bold": "mark_forward",
    "bold_highlight": "dark",
    "minimal_card": "light",
    "photo_overlay": "mark_forward",
}


def render_set(template: str, size, tag: str):
    slides = SAMPLE["en"]
    imgs = []
    for i, s in enumerate(slides):
        png = render_slide(
            skin=SKIN_FOR.get(template, "dark"), role=s["role"],
            eyebrow=s["eyebrow"], headline=s["headline"], body=s["body"],
            logo_path=LOGO, size=size, template=template,
            handle="@gastric_iq", slide_index=i, slide_total=len(slides),
        )
        p = OUT / f"{template}_{tag}_{i}.png"
        p.write_bytes(png)
        imgs.append(Image.open(p).convert("RGB"))
    return imgs


def contact_sheet(rows: list[tuple[str, list[Image.Image]]], out: Path, thumb_h=560, label_h=48):
    from PIL import ImageDraw, ImageFont
    cols = max(len(imgs) for _, imgs in rows)
    # scale thumbs to thumb_h
    def scaled(im):
        r = thumb_h / im.height
        return im.resize((int(im.width * r), thumb_h), Image.LANCZOS)
    gap = 24
    thumb_w = int(PORTRAIT_SIZE[0] * (thumb_h / PORTRAIT_SIZE[1]))
    sheet_w = cols * thumb_w + (cols + 1) * gap
    row_h = label_h + thumb_h + gap
    sheet_h = len(rows) * row_h + gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), (245, 243, 238))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(str(Path(__file__).resolve().parents[2] / "assets" / "fonts" / "AlbertSans-Regular.ttf"), 30)
    except Exception:
        font = ImageFont.load_default()
    y = gap
    for name, imgs in rows:
        d.text((gap, y + 8), name, font=font, fill=(30, 30, 30))
        yy = y + label_h
        x = gap
        for im in imgs:
            s = scaled(im)
            sheet.paste(s, (x + (thumb_w - s.width) // 2, yy))
            x += thumb_w + gap
        y += row_h
    sheet.save(out, format="JPEG", quality=90)
    return out


if __name__ == "__main__":
    rows = []
    for tmpl in TEMPLATES:
        imgs = render_set(tmpl, PORTRAIT_SIZE, "portrait")
        rows.append((f"{tmpl}  ·  skin={SKIN_FOR.get(tmpl)}  ·  1080x1350", imgs))
    sheet = contact_sheet(rows, OUT / "gallery_portrait.jpg")
    print("wrote", sheet)

    # one story-size sample per template (cover only) for the 9:16 look
    story_imgs = []
    for tmpl in TEMPLATES:
        png = render_slide(
            skin=SKIN_FOR.get(tmpl, "dark"), role="cover",
            eyebrow="Reminder", headline="The cycle peaks, then it fades",
            body=None, logo_path=LOGO, size=STORY_SIZE, template=tmpl,
            handle="@gastric_iq", slide_index=0, slide_total=3,
        )
        p = OUT / f"{tmpl}_story.png"
        p.write_bytes(png)
        story_imgs.append((tmpl, [Image.open(p).convert("RGB")]))
    sheet2 = contact_sheet(story_imgs, OUT / "gallery_story.jpg", thumb_h=760)
    print("wrote", sheet2)
