import hashlib
from pathlib import Path

import app.renderer.imagery as imagery


def test_returns_none_without_key(monkeypatch, tmp_path):
    monkeypatch.setattr(imagery, "_cache_dir", lambda: tmp_path)
    monkeypatch.setattr(imagery.get_settings(), "fal_key", None, raising=False)
    out = imagery.generate_background("scene", "warm_lifestyle", (1080, 1350), api_key=None)
    assert out is None


def test_caches_by_prompt_hash(monkeypatch, tmp_path):
    monkeypatch.setattr(imagery, "_cache_dir", lambda: tmp_path)
    calls = {"n": 0}

    def fake_call(prompt, model, size, seed):
        calls["n"] += 1
        return b"PNGDATA"

    monkeypatch.setattr(imagery, "_fal_image", fake_call)

    a = imagery.generate_background("scene", "warm_lifestyle", (1080, 1350), api_key="k")
    b = imagery.generate_background("scene", "warm_lifestyle", (1080, 1350), api_key="k")
    assert a == b == b"PNGDATA"
    assert calls["n"] == 1  # second call served from cache

    key = hashlib.sha256("warm_lifestyle|scene|1080x1350".encode()).hexdigest()
    assert (tmp_path / f"{key}.png").exists()


def test_falls_back_to_none_on_error(monkeypatch, tmp_path):
    monkeypatch.setattr(imagery, "_cache_dir", lambda: tmp_path)

    def boom(prompt, model, size, seed):
        raise RuntimeError("fal down")

    monkeypatch.setattr(imagery, "_fal_image", boom)
    out = imagery.generate_background("scene", "warm_lifestyle", (1080, 1350), api_key="k")
    assert out is None
