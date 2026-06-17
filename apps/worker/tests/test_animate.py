import app.renderer.imagery as imagery


def test_animate_returns_none_without_key():
    out = imagery.animate_background(b"PNG", "warm_lifestyle", (1080, 1920), api_key=None)
    assert out is None


def test_animate_uploads_and_downloads(monkeypatch):
    monkeypatch.setattr(imagery, "_fal_upload", lambda data, ct: "https://fal/x.png")
    monkeypatch.setattr(imagery, "_fal_video", lambda url, model, prompt: b"MP4DATA")
    out = imagery.animate_background(b"PNG", "warm_lifestyle", (1080, 1920), api_key="k")
    assert out == b"MP4DATA"


def test_animate_falls_back_to_none_on_error(monkeypatch):
    monkeypatch.setattr(imagery, "_fal_upload", lambda data, ct: "https://fal/x.png")

    def boom(url, model, prompt):
        raise RuntimeError("video down")

    monkeypatch.setattr(imagery, "_fal_video", boom)
    out = imagery.animate_background(b"PNG", "warm_lifestyle", (1080, 1920), api_key="k")
    assert out is None
