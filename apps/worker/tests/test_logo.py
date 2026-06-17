import io
from PIL import Image
from app.renderer.vessel import render_slide


def test_missing_logo_does_not_crash():
    out = render_slide(
        skin="dark", role="cover", eyebrow=None, headline="Hi", body=None,
        logo_path="assets/brands/does-not-exist.png", size=(1080, 1350),
    )
    assert Image.open(io.BytesIO(out)).size == (1080, 1350)


def test_logo_chip_on_dark(tmp_path):
    # A dark logo on dark skin should sit on a light chip (top-left brightened).
    logo = tmp_path / "logo.png"
    Image.new("RGBA", (200, 80), (20, 30, 50, 255)).save(logo)
    out = render_slide(
        skin="dark", role="cover", eyebrow=None, headline="Hi", body=None,
        logo_path=str(logo), size=(1080, 1350),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    # Pad ~86px; sample inside the logo area — chip makes it brighter than bg.
    assert img.getpixel((110, 110))[0] > img.getpixel((540, 700))[0]
