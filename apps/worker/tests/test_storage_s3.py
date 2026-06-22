from app.storage_s3 import build_public_url, content_type_for

def test_build_public_url_path_style():
    url = build_public_url(
        endpoint="https://garage.example.io", bucket="giq-media",
        key="us/piece1/reel.mp4", public_base=None,
    )
    assert url == "https://garage.example.io/giq-media/us/piece1/reel.mp4"

def test_build_public_url_prefers_cdn_base():
    url = build_public_url(
        endpoint="https://garage.example.io", bucket="giq-media",
        key="us/piece1/reel.mp4", public_base="https://cdn.example.com",
    )
    assert url == "https://cdn.example.com/us/piece1/reel.mp4"

def test_content_type_for():
    assert content_type_for("a/b/reel.mp4") == "video/mp4"
    assert content_type_for("a/b/slide_0.png") == "image/png"
    assert content_type_for("a/b/x.jpg") == "image/jpeg"
