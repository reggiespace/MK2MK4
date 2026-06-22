from __future__ import annotations

import logging
import os
import threading
from typing import Any

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import get_settings
from . import jobs
from .renderer.vessel import render_slide, PORTRAIT_SIZE
from .renderer.reel import render_reel
from .renderer.imagery import generate_background, piece_seed
from .storage import save_asset
from .quality import probe_image, probe_video

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("worker")

app = FastAPI(title="Gastric IQ Media Worker", version="0.2.0")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def verify_secret(x_worker_secret: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.shared_secret:
        return
    if x_worker_secret != settings.shared_secret:
        log.warning("auth rejected: header=%r", x_worker_secret)
        raise HTTPException(status_code=401, detail="invalid worker secret")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SlideInput(BaseModel):
    index: int
    role: str
    skin: str
    eyebrow: str | None = None
    headline: str | None = None
    body: str | None = None
    imagePrompt: str | None = None


class BrandKitInput(BaseModel):
    logoPath: str | None = None
    tokens: Any = None
    fonts: Any = None
    defaultSkin: str = "mark_forward"
    voiceId: str | None = None
    artDirection: str = "warm_lifestyle"


class RenderRequest(BaseModel):
    jobId: str
    pieceId: str
    kind: str
    slides: list[SlideInput]
    brandKit: BrandKitInput
    voiceover: str | None = None
    locale: str = "en"
    voiceGender: str | None = None
    motion: bool = False


class JobResponse(BaseModel):
    jobId: str
    status: str
    progress: int = 0
    assets: list[dict[str, Any]] = []
    error: str | None = None


# ---------------------------------------------------------------------------
# Background rendering helpers
# ---------------------------------------------------------------------------

def _bg_for_slide(slide: SlideInput, art_direction: str, size: tuple[int, int], piece_id: str) -> bytes | None:
    if not slide.imagePrompt:
        return None
    return generate_background(
        slide.imagePrompt, art_direction, size, get_settings().fal_key,
        seed=piece_seed(piece_id),
    )


def _callback(job_id: str, piece_id: str, assets: list[dict[str, Any]]) -> None:
    """Notify the web app that a render job is complete."""
    web_base = os.getenv("WEB_BASE_URL", "http://localhost:3000")
    secret = get_settings().shared_secret or ""
    try:
        r = httpx.post(
            f"{web_base}/api/worker/callback",
            json={"jobId": job_id, "pieceId": piece_id, "assets": assets},
            headers={"X-Worker-Secret": secret},
            timeout=10,
        )
        log.info("callback job=%s status=%s assets=%d", job_id, r.status_code, len(assets))
    except Exception as exc:
        log.error("callback failed job=%s: %s", job_id, exc)


def _render_image_bg(req: RenderRequest) -> None:
    job_id = req.jobId
    log.info("image render start job=%s piece=%s", job_id, req.pieceId)
    jobs.update(job_id, status="running", progress=10)
    try:
        slide = req.slides[0] if req.slides else None
        if not slide:
            raise ValueError("no slides provided")

        bg = _bg_for_slide(slide, req.brandKit.artDirection, PORTRAIT_SIZE, req.pieceId)
        png = render_slide(
            skin=slide.skin,
            role=slide.role,
            eyebrow=slide.eyebrow,
            headline=slide.headline,
            body=slide.body,
            logo_path=req.brandKit.logoPath,
            background_image=bg,
            size=PORTRAIT_SIZE,
        )
        jobs.update(job_id, progress=80)
        engine = "fal" if bg is not None else "template"
        log.info("image rendered skin=%s engine=%s size=%d bytes", slide.skin, engine, len(png))

        meta = probe_image(png, min_w=1000, min_h=1000)
        path = f"pieces/{req.pieceId}/image_{slide.index}.png"
        url = save_asset(path, png)
        asset = {"url": url, "type": "image", "engine": engine, "slideIndex": slide.index, "prompt": slide.imagePrompt, "meta": meta}
        jobs.update(job_id, status="done", progress=100, result={"assets": [asset]})
        log.info("image done job=%s url=%s", job_id, url)
        _callback(job_id, req.pieceId, [asset])
    except Exception as exc:
        log.exception("image render failed job=%s", job_id)
        jobs.update(job_id, status="failed", error=str(exc))
        _callback(job_id, req.pieceId, [])


def _render_reel_bg(req: RenderRequest) -> None:
    job_id = req.jobId
    log.info("reel render start job=%s piece=%s slides=%d locale=%s", job_id, req.pieceId, len(req.slides), req.locale)
    jobs.update(job_id, status="running", progress=5)
    try:
        def progress_cb(pct: int) -> None:
            log.info("reel progress job=%s %d%%", job_id, pct)
            jobs.update(job_id, progress=pct)

        mp4 = render_reel(
            job_id=job_id,
            piece_id=req.pieceId,
            slides=[s.model_dump() for s in req.slides],
            brand_kit=req.brandKit.model_dump(by_alias=True),
            voiceover=req.voiceover,
            locale=req.locale,
            voice_gender=req.voiceGender,
            progress_callback=progress_cb,
            motion=req.motion,
        )
        require_audio = bool(req.voiceover and get_settings().elevenlabs_api_key)
        meta = probe_video(mp4, require_audio=require_audio)
        path = f"pieces/{req.pieceId}/reel.mp4"
        url = save_asset(path, mp4)
        assets = [{"url": url, "type": "video", "engine": "template", "meta": meta}]
        jobs.update(job_id, status="done", progress=100, result={"assets": assets})
        log.info("reel done job=%s url=%s size=%d bytes", job_id, url, len(mp4))
        _callback(job_id, req.pieceId, assets)
    except Exception as exc:
        log.exception("reel render failed job=%s", job_id)
        jobs.update(job_id, status="failed", error=str(exc))
        _callback(job_id, req.pieceId, [])


def _render_carousel_bg(req: RenderRequest) -> None:
    job_id = req.jobId
    log.info("carousel render start job=%s piece=%s slides=%d", job_id, req.pieceId, len(req.slides))
    jobs.update(job_id, status="running", progress=5)
    assets: list[dict[str, Any]] = []
    try:
        total = len(req.slides)
        for i, slide in enumerate(req.slides):
            bg = _bg_for_slide(slide, req.brandKit.artDirection, PORTRAIT_SIZE, req.pieceId)
            png = render_slide(
                skin=slide.skin,
                role=slide.role,
                eyebrow=slide.eyebrow,
                headline=slide.headline,
                body=slide.body,
                logo_path=req.brandKit.logoPath,
                background_image=bg,
                size=PORTRAIT_SIZE,
            )
            meta = probe_image(png, min_w=1000, min_h=1000)
            path = f"pieces/{req.pieceId}/slide_{slide.index}.png"
            url = save_asset(path, png)
            engine = "fal" if bg is not None else "template"
            assets.append({"url": url, "type": "image", "engine": engine, "slideIndex": slide.index, "prompt": slide.imagePrompt, "meta": meta})
            pct = int(10 + 85 * (i + 1) / total)
            log.info("carousel slide %d/%d done job=%s", i + 1, total, job_id)
            jobs.update(job_id, progress=pct)

        jobs.update(job_id, status="done", progress=100, result={"assets": assets})
        log.info("carousel done job=%s assets=%d", job_id, len(assets))
        _callback(job_id, req.pieceId, assets)
    except Exception as exc:
        log.exception("carousel render failed job=%s", job_id)
        jobs.update(job_id, status="failed", error=str(exc))
        _callback(job_id, req.pieceId, [])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "giq-media-worker"}


@app.post("/render/{kind}", dependencies=[Depends(verify_secret)])
def render(
    kind: str,
    req: RenderRequest,
    background_tasks: BackgroundTasks,
) -> JobResponse:
    if kind not in {"image", "carousel", "reel"}:
        raise HTTPException(status_code=400, detail=f"unknown render kind: {kind}")

    log.info("render request kind=%s piece=%s job=%s", kind, req.pieceId, req.jobId)
    job = jobs.create(req.jobId)

    if kind == "image":
        fn = _render_image_bg
    elif kind == "carousel":
        fn = _render_carousel_bg
    else:
        fn = _render_reel_bg

    t = threading.Thread(target=fn, args=(req,), daemon=True)
    t.start()

    return JobResponse(jobId=job.id, status=job.status, progress=job.progress)


@app.get("/jobs/{job_id}", dependencies=[Depends(verify_secret)])
def job_status(job_id: str) -> JobResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return JobResponse(
        jobId=job.id,
        status=job.status,
        progress=job.progress,
        assets=job.result.get("assets", []),
        error=job.error,
    )
