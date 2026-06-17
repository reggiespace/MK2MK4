import io

from PIL import Image

from app.renderer.vessel import render_slide


def test_transparent_overlay_has_alpha():
    out = render_slide(
        skin="dark", role="body", eyebrow="EAT", headline="Fiber first",
        body="Veg first.", size=(1080, 1920), transparent=True,
    )
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGBA"
    # A pixel in the empty top area should be fully transparent.
    assert img.getpixel((540, 40))[3] == 0
