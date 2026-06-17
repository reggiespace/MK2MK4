import io

from PIL import Image

from app.renderer.vessel import render_slide


def _bg(size, color=(200, 120, 60)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_renders_over_background_image():
    out = render_slide(
        skin="dark", role="body", eyebrow="EAT", headline="Fiber first",
        body="Start meals with vegetables.", size=(1080, 1350),
        background_image=_bg((1080, 1350)),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    assert img.size == (1080, 1350)
    # Top region keeps background hue (orange-ish); not flat near-black.
    top_pixel = img.getpixel((540, 60))
    assert top_pixel[0] > 100  # red channel from the orange bg survives


def test_flat_card_when_no_background():
    out = render_slide(
        skin="dark", role="body", eyebrow=None, headline="Hi", body=None,
        size=(1080, 1350),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    assert img.size == (1080, 1350)
