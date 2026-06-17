import app.main as main


def test_slide_input_has_image_prompt():
    s = main.SlideInput(index=0, role="cover", skin="dark", imagePrompt="oats")
    assert s.imagePrompt == "oats"


def test_brandkit_has_art_direction():
    bk = main.BrandKitInput(artDirection="cinematic")
    assert bk.artDirection == "cinematic"


def test_render_request_has_motion():
    req = main.RenderRequest(
        jobId="j", pieceId="p", kind="reel", slides=[], brandKit=main.BrandKitInput()
    )
    assert req.motion is False
