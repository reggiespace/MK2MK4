"""ReggieSpace Social Studio — media worker.

Renders post art by driving headless Chromium over the web app's own render
route, so published media comes from the same React renderer that drew the
preview. Still frames render synchronously; reels are queued because ffmpeg is
slow, and report back through the web app's worker callback.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import get_settings
from .renderer.browser import render_slides as browser_render_slides
from .renderer.reel import assemble as assemble_reel
from .storage import save_asset

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("worker")

app = FastAPI(title="ReggieSpace Studio Media Worker", version="1.0.0")


def verify_secret(x_worker_secret: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.shared_secret:
        return
    if x_worker_secret != settings.shared_secret:
        log.warning("auth rejected")
        raise HTTPException(status_code=401, detail="invalid worker secret")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RenderRequest(BaseModel):
    postId: str
    jobId: str
    workspaceId: str
    slideCount: int
    width: int
    height: int
    baseUrl: str
    token: str


class ReelRequest(RenderRequest):
    audioUrl: str | None = None
    callbackUrl: str


class RenderedFrame(BaseModel):
    url: str
    slideIndex: int
    width: int
    height: int


class SlidesResponse(BaseModel):
    frames: list[RenderedFrame]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _capture(req: RenderRequest) -> list[bytes]:
    return browser_render_slides(
        base_url=req.baseUrl,
        post_id=req.postId,
        token=req.token,
        slide_count=req.slideCount,
        width=req.width,
        height=req.height,
    )


@app.post("/render/slides", response_model=SlidesResponse, dependencies=[Depends(verify_secret)])
def render_slides(req: RenderRequest) -> SlidesResponse:
    """Screenshot every slide and store it. Fast enough to await inline."""
    log.info("render slides post=%s count=%d", req.postId, req.slideCount)
    shots = _capture(req)

    frames: list[RenderedFrame] = []
    for index, data in enumerate(shots):
        key = f"workspaces/{req.workspaceId}/posts/{req.postId}/slide-{index:02d}.png"
        url = save_asset(key, data)
        frames.append(
            RenderedFrame(url=url, slideIndex=index, width=req.width, height=req.height)
        )

    log.info("render slides done post=%s frames=%d", req.postId, len(frames))
    return SlidesResponse(frames=frames)


def _run_reel(req: ReelRequest) -> None:
    settings = get_settings()
    payload: dict = {"jobId": req.jobId, "postId": req.postId, "assets": []}

    try:
        shots = _capture(req)

        audio: bytes | None = None
        if req.audioUrl:
            with httpx.Client(timeout=60) as client:
                res = client.get(req.audioUrl)
                res.raise_for_status()
                audio = res.content

        video = assemble_reel(frames=shots, audio=audio)
        key = f"workspaces/{req.workspaceId}/posts/{req.postId}/reel.mp4"
        url = save_asset(key, video)

        payload["assets"] = [
            {"url": url, "kind": "video", "width": req.width, "height": req.height}
        ]
        log.info("reel done post=%s", req.postId)
    except Exception as exc:  # noqa: BLE001 — the failure must reach the web app
        log.exception("reel failed post=%s", req.postId)
        payload["error"] = str(exc)

    headers = {}
    if settings.shared_secret:
        headers["x-worker-secret"] = settings.shared_secret
    try:
        with httpx.Client(timeout=30) as client:
            client.post(req.callbackUrl, json=payload, headers=headers)
    except Exception:  # noqa: BLE001
        log.exception("callback failed post=%s", req.postId)


@app.post("/render/reel", dependencies=[Depends(verify_secret)])
def render_reel(req: ReelRequest, background: BackgroundTasks) -> dict[str, str]:
    """Queue a reel render; the web app hears back on its worker callback."""
    log.info("queue reel post=%s", req.postId)
    background.add_task(_run_reel, req)
    return {"status": "queued", "jobId": req.jobId}
