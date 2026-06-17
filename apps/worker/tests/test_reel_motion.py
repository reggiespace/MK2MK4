import app.renderer.reel as reel


def test_motion_uses_clip_when_animation_succeeds(monkeypatch, tmp_path):
    # Stub fal + ffmpeg boundaries; assert the motion branch is taken.
    monkeypatch.setattr(reel, "generate_background", lambda *a, **k: b"PNG")
    monkeypatch.setattr(reel, "animate_background", lambda *a, **k: b"MP4")
    monkeypatch.setattr(reel, "render_slide", lambda **k: b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    seen = {"motion_clip": False}

    def fake_assemble(clips, overlays, audio, motion):
        seen["motion_clip"] = motion
        return b"REEL"

    monkeypatch.setattr(reel, "_assemble", fake_assemble)
    out = reel.render_reel(
        job_id="j", piece_id="p",
        slides=[{"index": 0, "role": "cover", "skin": "dark", "headline": "Hi",
                 "imagePrompt": "oats"}],
        brand_kit={"artDirection": "warm_lifestyle"}, voiceover=None,
        locale="en", motion=True,
    )
    assert out == b"REEL"
    assert seen["motion_clip"] is True


def test_falls_back_to_kenburns_when_animation_fails(monkeypatch):
    monkeypatch.setattr(reel, "generate_background", lambda *a, **k: b"PNG")
    monkeypatch.setattr(reel, "animate_background", lambda *a, **k: None)
    monkeypatch.setattr(reel, "render_slide", lambda **k: b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    seen = {"motion": None}
    monkeypatch.setattr(reel, "_assemble", lambda clips, overlays, audio, motion: seen.__setitem__("motion", motion) or b"REEL")
    reel.render_reel(
        job_id="j", piece_id="p",
        slides=[{"index": 0, "role": "cover", "skin": "dark", "headline": "Hi",
                 "imagePrompt": "oats"}],
        brand_kit={"artDirection": "warm_lifestyle"}, voiceover=None,
        locale="en", motion=True,
    )
    assert seen["motion"] is False  # degraded to still path
