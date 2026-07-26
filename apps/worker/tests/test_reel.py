from app.renderer.reel import default_durations, HOOK_DURATION_S, BODY_DURATION_S, CTA_DURATION_S


def test_durations_open_fast_and_close_slow():
    """The hook must land near-instantly; the end card needs a beat to read."""
    durations = default_durations(4)
    assert durations == [HOOK_DURATION_S, BODY_DURATION_S, BODY_DURATION_S, CTA_DURATION_S]


def test_durations_handle_short_reels():
    assert default_durations(0) == []
    assert default_durations(1) == [BODY_DURATION_S]
    assert default_durations(2) == [HOOK_DURATION_S, CTA_DURATION_S]


def test_durations_match_frame_count():
    for n in range(1, 9):
        assert len(default_durations(n)) == n
