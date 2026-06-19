# Garage S3 + Daily Auto-Draft Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host rendered media on public Garage S3 and add a cron-driven daily pipeline (research → writer → generate → render → host → claims-check) that lands review-ready drafts for one-click operator approval.

**Architecture:** Extend the existing pnpm monorepo (`apps/web` Next.js 16 + `apps/worker` Python FastAPI). The worker's storage seam swaps local-volume writes for an S3-compatible Garage client with a public-URL + media-quality verify. The web app gains a `composeStory` writer step, a `firstComment` field threaded end-to-end, a `ContentRun`-grouped idempotent `/api/cron/daily-run` orchestrator, a daily-queue review UI, and a docker-compose cron sidecar.

**Tech Stack:** TypeScript (Next.js 16, Prisma 7 + `@prisma/adapter-pg`, Zod, OpenAI SDK, Vitest), Python 3.12 (FastAPI, boto3, Pillow, ffmpeg/ffprobe, pytest), Docker Compose / dokploy.

**Reference spec:** `docs/superpowers/specs/2026-06-19-garage-autopilot-foundation-design.md`

---

## Conventions

- **Web tests:** `pnpm -C apps/web exec vitest run <path>` (all: `pnpm -C apps/web test`).
- **Worker tests:** `cd apps/worker && python -m pytest <path> -v` (venv at `apps/worker/.venv`).
- **Prisma migrate (dev):** `pnpm -C apps/web exec prisma migrate dev --name <name>` then `pnpm -C apps/web exec prisma generate`.
- Commit after each task with the message shown. Branch is `feat/garage-autopilot`.

## File Structure

**Worker (Python)**
- Modify `apps/worker/pyproject.toml` — add `boto3`.
- Modify `apps/worker/app/config.py` — S3 / storage-backend settings.
- Create `apps/worker/app/storage_s3.py` — Garage S3 client + public-URL verify.
- Modify `apps/worker/app/storage.py` — backend dispatch (local | s3).
- Create `apps/worker/app/quality.py` — media-quality probes (ffprobe / Pillow).
- Modify `apps/worker/app/main.py` — run quality probe before `save_asset`; carry `meta`.
- Create `apps/worker/tests/test_storage_s3.py`, `apps/worker/tests/test_quality.py`.

**Web (TypeScript)**
- Modify `apps/web/prisma/schema.prisma` — `ContentRun`, `Cadence`, `PieceStatus.blocked`, `ContentPiece.firstComment` + `claims` + `runId`, `Idea.storyBrief`.
- Modify `apps/web/prisma/seed.ts` — cadence rows.
- Modify `apps/web/src/lib/llm/types.ts` — `storyBriefSchema`, `firstComment` on draft, `StoryBrief` type.
- Modify `apps/web/src/lib/llm/prompts.ts` — `storyPrompt`, `firstComment` in draft prompt.
- Modify `apps/web/src/lib/llm/provider.ts` — `composeStory` on interface + OpenAI + Mock.
- Create `apps/web/src/lib/pipeline/cadence.ts` — weekday → pillar/format/networks picker.
- Create `apps/web/src/lib/pipeline/run.ts` — the orchestrator (one brand, one day).
- Create `apps/web/src/app/api/cron/daily-run/route.ts` — cron entrypoint.
- Modify `apps/web/src/app/api/pieces/route.ts` — persist `firstComment`.
- Modify `apps/web/src/lib/publishers/types.ts` + `zernio.ts` + `buffer.ts` + `schedule/route.ts` — thread `firstComment`.
- Modify `apps/web/src/lib/env.ts` — `cronSecret`, S3 passthrough vars.
- Create `apps/web/src/app/(app)/queue/page.tsx` + `queue-client.tsx` — daily queue.
- Modify `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx` — show story brief + first comment.
- Tests under `apps/web/src/lib/**/__tests__/`.

**Infra**
- Modify `infra/docker-compose.yml` — `scheduler` cron sidecar.
- Create `infra/cron/crontab` + `infra/cron/run-daily.sh`.
- Modify `.env.example` — new vars.

---

## Phase A — Schema & seed foundations

### Task A1: Add schema models and fields

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add `blocked` to `PieceStatus` and new fields on `ContentPiece`**

In the `enum PieceStatus` block, add `blocked`:

```prisma
enum PieceStatus {
  draft
  rendering
  review
  blocked
  scheduled
  published
  failed
}
```

In `model ContentPiece`, add these fields (next to `caption`):

```prisma
  caption     String      @db.Text
  firstComment String?    @db.Text // links + engagement question, link-free caption
  claims      Json? // last claims-check result snapshot for the review panel
  runId       String?
  run         ContentRun? @relation(fields: [runId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Add `storyBrief` to `Idea`**

In `model Idea`, after `insightsContext`:

```prisma
  insightsContext   String?    @db.Text
  storyBrief        Json? // writer-step narrative: { story, keyMessage, beats[], ctaIntent }
```

- [ ] **Step 3: Add `ContentRun` and `Cadence` models**

Append at the end of the file:

```prisma
// ---------------------------------------------------------------------------
// Daily pipeline: run grouping + cadence config
// ---------------------------------------------------------------------------
enum RunStatus {
  running
  complete
  failed
}

model ContentRun {
  id        String    @id @default(cuid())
  brandId   String
  brand     Brand     @relation(fields: [brandId], references: [id], onDelete: Cascade)
  runDate   DateTime  @db.Date
  pillar    String
  format    Format
  status    RunStatus @default(running)
  error     String?   @db.Text
  createdAt DateTime  @default(now())

  pieces ContentPiece[]

  @@unique([brandId, runDate, pillar])
}

model Cadence {
  id       String   @id @default(cuid())
  brandId  String
  brand    Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  weekday  Int // 0=Sunday .. 6=Saturday
  pillar   String
  format   Format
  networks String[] // ['instagram','facebook'] | ['instagram']

  @@unique([brandId, weekday])
}
```

- [ ] **Step 4: Add back-relations on `Brand`**

In `model Brand`, add to the relation list (next to `pieces ContentPiece[]`):

```prisma
  runs     ContentRun[]
  cadences Cadence[]
```

- [ ] **Step 5: Create the migration**

Run: `pnpm -C apps/web exec prisma migrate dev --name daily_pipeline_foundations`
Expected: migration created and applied; `Idea`, `ContentPiece`, `ContentRun`, `Cadence` updated.

- [ ] **Step 6: Regenerate the client**

Run: `pnpm -C apps/web exec prisma generate`
Expected: success; `@/generated/prisma` reflects new models/fields.

- [ ] **Step 7: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
git commit -m "feat(db): ContentRun, Cadence, firstComment, storyBrief, blocked status"
```

### Task A2: Seed cadence rows

**Files:**
- Modify: `apps/web/prisma/seed.ts`

- [ ] **Step 1: Add a cadence seeder** after the `seedBrand` function:

```ts
// Weekly cadence per brand (brief §13). weekday: 0=Sun..6=Sat.
// Reels → instagram only (BR has no TikTok channel here); static → ig+fb.
const CADENCE_US: { weekday: number; pillar: string; format: "single" | "carousel" | "reel"; networks: string[] }[] = [
  { weekday: 1, pillar: "Medication-cycle education", format: "carousel", networks: ["instagram", "facebook"] },
  { weekday: 2, pillar: "Side-effect readiness (without fear)", format: "reel", networks: ["instagram"] },
  { weekday: 3, pillar: "Protein & lean mass", format: "single", networks: ["instagram", "facebook"] },
  { weekday: 4, pillar: "Bariatric guidance", format: "carousel", networks: ["instagram", "facebook"] },
  { weekday: 5, pillar: "Trust & privacy", format: "reel", networks: ["instagram"] },
];
const CADENCE_BR: typeof CADENCE_US = [
  { weekday: 1, pillar: "Educação sobre o ciclo da medicação", format: "carousel", networks: ["instagram", "facebook"] },
  { weekday: 3, pillar: "Preparo para efeitos colaterais (sem medo)", format: "reel", networks: ["instagram"] },
  { weekday: 5, pillar: "Proteína e massa magra", format: "single", networks: ["instagram", "facebook"] },
];

async function seedCadence(brandId: string, rows: typeof CADENCE_US) {
  for (const r of rows) {
    await prisma.cadence.upsert({
      where: { brandId_weekday: { brandId, weekday: r.weekday } },
      update: { pillar: r.pillar, format: r.format, networks: r.networks },
      create: { brandId, weekday: r.weekday, pillar: r.pillar, format: r.format, networks: r.networks },
    });
  }
}
```

- [ ] **Step 2: Call it from `main()`** — capture brand ids and seed cadence:

```ts
async function main() {
  const us = await seedBrand({
    key: "gastric-us", name: "Gastric IQ", locale: "en",
    publisher: "buffer", tone: TONE_EN, pillars: PILLARS_EN,
  });
  const br = await seedBrand({
    key: "gastric-br", name: "Gastric IQ Brasil", locale: "pt_BR",
    publisher: "zernio", tone: TONE_PT, pillars: PILLARS_PT,
  });
  await seedCadence(us.id, CADENCE_US);
  await seedCadence(br.id, CADENCE_BR);
  console.log("Seed complete: 2 brands, 2 brand kits, 10 pillars, cadence rows.");
}
```

- [ ] **Step 3: Run the seed**

Run: `pnpm -C apps/web db:seed`
Expected: "Seed complete: ... cadence rows."

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/seed.ts
git commit -m "feat(seed): per-brand weekly cadence rows"
```

---

## Phase B — Garage S3 storage + media quality (worker)

### Task B1: Media-quality probes

**Files:**
- Create: `apps/worker/app/quality.py`
- Test: `apps/worker/tests/test_quality.py`

- [ ] **Step 1: Write the failing test**

```python
# apps/worker/tests/test_quality.py
import io
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from app.quality import probe_image, probe_video, MediaQualityError


def _png_bytes(w=1080, h=1350, color=(110, 165, 71)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_probe_image_returns_dimensions():
    meta = probe_image(_png_bytes(), min_w=1000, min_h=1000)
    assert meta["width"] == 1080 and meta["height"] == 1350


def test_probe_image_rejects_blank():
    with pytest.raises(MediaQualityError):
        probe_image(_png_bytes(color=(0, 0, 0)), min_w=1000, min_h=1000)


def test_probe_image_rejects_too_small():
    with pytest.raises(MediaQualityError):
        probe_image(_png_bytes(w=200, h=200), min_w=1000, min_h=1000)


def test_probe_video_requires_streams(tmp_path: Path):
    # 1s 1080x1920 test video WITH audio via ffmpeg lavfi
    out = tmp_path / "v.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=green:s=1080x1920:d=1",
         "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
        check=True, capture_output=True,
    )
    meta = probe_video(out.read_bytes(), require_audio=True)
    assert meta["width"] == 1080 and meta["height"] == 1920
    assert meta["durationMs"] >= 800 and meta["hasAudio"] is True
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && python -m pytest tests/test_quality.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.quality'`.

- [ ] **Step 3: Implement `quality.py`**

```python
# apps/worker/app/quality.py
"""Media-quality probes used by the host step to reject broken/empty assets."""
from __future__ import annotations

import io
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image


class MediaQualityError(Exception):
    """Raised when a rendered asset fails a quality gate."""


def probe_image(data: bytes, *, min_w: int, min_h: int, min_stddev: float = 3.0) -> dict[str, Any]:
    """Validate an image is non-blank and at least min_w x min_h. Returns meta."""
    if not data:
        raise MediaQualityError("image is empty")
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if w < min_w or h < min_h:
        raise MediaQualityError(f"image too small: {w}x{h} < {min_w}x{min_h}")
    # Blank detection: standard deviation across a downscaled grayscale sample.
    stat = img.resize((64, 64)).convert("L")
    px = list(stat.getdata())
    mean = sum(px) / len(px)
    var = sum((p - mean) ** 2 for p in px) / len(px)
    if var ** 0.5 < min_stddev:
        raise MediaQualityError("image appears blank (low variance)")
    return {"width": w, "height": h}


def _ffprobe(path: Path) -> dict[str, Any]:
    res = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        check=True, capture_output=True,
    )
    return json.loads(res.stdout or "{}")


def probe_video(data: bytes, *, require_audio: bool = True) -> dict[str, Any]:
    """Validate a video has a video stream (and audio if required) and non-zero
    duration. Returns meta {width, height, durationMs, hasAudio}."""
    if not data:
        raise MediaQualityError("video is empty")
    with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
        tmp.write(data)
        tmp.flush()
        info = _ffprobe(Path(tmp.name))
    streams = info.get("streams", [])
    vid = next((s for s in streams if s.get("codec_type") == "video"), None)
    aud = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if vid is None:
        raise MediaQualityError("no video stream")
    dur_ms = int(float(info.get("format", {}).get("duration", 0)) * 1000)
    if dur_ms <= 0:
        raise MediaQualityError("video has zero duration")
    if require_audio and aud is None:
        raise MediaQualityError("no audio stream")
    return {
        "width": int(vid.get("width", 0)),
        "height": int(vid.get("height", 0)),
        "durationMs": dur_ms,
        "hasAudio": aud is not None,
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/worker && python -m pytest tests/test_quality.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/app/quality.py apps/worker/tests/test_quality.py
git commit -m "feat(worker): media-quality probes for images and videos"
```

### Task B2: Garage S3 client + public-URL verify

**Files:**
- Modify: `apps/worker/pyproject.toml`
- Modify: `apps/worker/app/config.py`
- Create: `apps/worker/app/storage_s3.py`
- Test: `apps/worker/tests/test_storage_s3.py`

- [ ] **Step 1: Add boto3 dependency**

In `apps/worker/pyproject.toml`, add to `dependencies`:

```toml
    "fal-client>=0.5",
    "boto3>=1.35",
```

Then install: `cd apps/worker && .venv/bin/pip install 'boto3>=1.35'`
Expected: boto3 installed.

- [ ] **Step 2: Add S3 settings to config**

In `apps/worker/app/config.py`, inside `class Settings`, add:

```python
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")  # local | s3
    s3_bucket: str | None = os.getenv("MEDIA_S3_BUCKET") or None
    s3_region: str = os.getenv("MEDIA_S3_REGION", "garage")
    s3_endpoint: str | None = os.getenv("MEDIA_S3_ENDPOINT") or None
    s3_public_base_url: str | None = os.getenv("MEDIA_PUBLIC_BASE_URL") or None
    aws_access_key_id: str | None = os.getenv("AWS_ACCESS_KEY_ID") or None
    aws_secret_access_key: str | None = os.getenv("AWS_SECRET_ACCESS_KEY") or None
```

- [ ] **Step 3: Write the failing test** (URL builder is pure; verify is mocked)

```python
# apps/worker/tests/test_storage_s3.py
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
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/worker && python -m pytest tests/test_storage_s3.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.storage_s3'`.

- [ ] **Step 5: Implement `storage_s3.py`**

```python
# apps/worker/app/storage_s3.py
"""Garage (S3-compatible) object storage: path-style upload + public-URL verify."""
from __future__ import annotations

import httpx

from .config import get_settings

_EXT_CT = {
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
}


def content_type_for(key: str) -> str:
    for ext, ct in _EXT_CT.items():
        if key.lower().endswith(ext):
            return ct
    return "application/octet-stream"


def build_public_url(*, endpoint: str, bucket: str, key: str, public_base: str | None) -> str:
    if public_base:
        return f"{public_base.rstrip('/')}/{key.lstrip('/')}"
    return f"{endpoint.rstrip('/')}/{bucket}/{key.lstrip('/')}"


def _client():
    import boto3
    from botocore.config import Config

    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint,
        region_name=s.s3_region,
        aws_access_key_id=s.aws_access_key_id,
        aws_secret_access_key=s.aws_secret_access_key,
        config=Config(s3={"addressing_style": "path"}),
    )


def upload_and_verify(key: str, data: bytes) -> str:
    """PUT object public-read, then GET its public URL to confirm 200 +
    content-type. Returns the public URL. Raises on failure."""
    s = get_settings()
    if not (s.s3_bucket and s.s3_endpoint):
        raise RuntimeError("S3 storage selected but MEDIA_S3_BUCKET/ENDPOINT unset")
    ct = content_type_for(key)
    client = _client()
    client.put_object(
        Bucket=s.s3_bucket, Key=key, Body=data,
        ContentType=ct, ACL="public-read",
    )
    url = build_public_url(
        endpoint=s.s3_endpoint, bucket=s.s3_bucket, key=key,
        public_base=s.s3_public_base_url,
    )
    resp = httpx.get(url, timeout=15, follow_redirects=True)
    if resp.status_code != 200:
        raise RuntimeError(f"public URL verify failed: {resp.status_code} for {url}")
    got_ct = resp.headers.get("content-type", "")
    if ct.split("/")[0] not in got_ct:
        raise RuntimeError(f"content-type mismatch: expected {ct}, got {got_ct!r}")
    return url
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/worker && python -m pytest tests/test_storage_s3.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/pyproject.toml apps/worker/app/config.py apps/worker/app/storage_s3.py apps/worker/tests/test_storage_s3.py
git commit -m "feat(worker): Garage S3 upload + public-URL verify"
```

### Task B3: Dispatch storage backend

**Files:**
- Modify: `apps/worker/app/storage.py`

- [ ] **Step 1: Replace `save_asset` with backend dispatch**

```python
# apps/worker/app/storage.py
"""Object storage: local volume (dev) or Garage S3 (prod), chosen by config."""
import os
from pathlib import Path

from .config import get_settings
from .storage_s3 import upload_and_verify


def storage_root() -> Path:
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _save_local(relative_path: str, data: bytes) -> str:
    dest = storage_root() / relative_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    base = os.getenv("PUBLIC_MEDIA_BASE_URL", "http://localhost:3000/media")
    return f"{base}/{relative_path}"


def save_asset(relative_path: str, data: bytes) -> str:
    """Persist bytes and return a publicly fetchable URL."""
    if get_settings().storage_backend == "s3":
        return upload_and_verify(relative_path, data)
    return _save_local(relative_path, data)
```

- [ ] **Step 2: Verify existing worker tests still pass**

Run: `cd apps/worker && python -m pytest tests/test_render_paths.py tests/test_smoke.py -v`
Expected: PASS (local backend is the default; behavior unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/worker/app/storage.py
git commit -m "feat(worker): storage backend dispatch (local|s3)"
```

### Task B4: Quality-gate the render handlers

**Files:**
- Modify: `apps/worker/app/main.py`

- [ ] **Step 1: Import probes** — add to the imports block:

```python
from .storage import save_asset
from .quality import probe_image, probe_video, MediaQualityError
```

- [ ] **Step 2: Gate the image handler** — in `_render_image_bg`, replace the
`path = ...; url = save_asset(...); asset = {...}` block with:

```python
        meta = probe_image(png, min_w=1000, min_h=1000)
        path = f"pieces/{req.pieceId}/image_{slide.index}.png"
        url = save_asset(path, png)
        asset = {"url": url, "type": "image", "engine": engine, "slideIndex": slide.index, "prompt": slide.imagePrompt, "meta": meta}
```

- [ ] **Step 3: Gate the reel handler** — in `_render_reel_bg`, replace the
`path = ...; url = save_asset(...); assets = [...]` block with:

```python
        require_audio = bool(req.voiceover and get_settings().elevenlabs_api_key)
        meta = probe_video(mp4, require_audio=require_audio)
        path = f"pieces/{req.pieceId}/reel.mp4"
        url = save_asset(path, mp4)
        assets = [{"url": url, "type": "video", "engine": "template", "meta": meta}]
```

- [ ] **Step 4: Gate the carousel handler** — in `_render_carousel_bg`, inside the
loop replace the `path = ...; url = save_asset(...); assets.append({...})` block with:

```python
            meta = probe_image(png, min_w=1000, min_h=1000)
            path = f"pieces/{req.pieceId}/slide_{slide.index}.png"
            url = save_asset(path, png)
            engine = "fal" if bg is not None else "template"
            assets.append({"url": url, "type": "image", "engine": engine, "slideIndex": slide.index, "prompt": slide.imagePrompt, "meta": meta})
```

- [ ] **Step 5: Confirm `MediaQualityError` is caught** — the existing
`except Exception as exc:` in each handler already marks the job failed and
callbacks empty assets; `MediaQualityError` subclasses `Exception`, so a failed
probe correctly fails the render. No change needed.

- [ ] **Step 6: Run worker render-path tests**

Run: `cd apps/worker && python -m pytest tests/test_render_paths.py -v`
Expected: PASS. (If a fixture image is below 1000px, lower the test fixture's
`min_w/min_h` expectation is not allowed — instead ensure fixtures render at
`PORTRAIT_SIZE`. Existing renders are 1080×1350/1920, so they pass.)

- [ ] **Step 7: Commit**

```bash
git add apps/worker/app/main.py
git commit -m "feat(worker): quality-gate renders before hosting; carry media meta"
```

### Task B5: Persist asset meta in the callback

**Files:**
- Modify: `apps/web/src/app/api/worker/callback/route.ts`

- [ ] **Step 1: Accept `meta` in the asset schema** — in `bodySchema.assets`
object, add after `prompt`:

```ts
      prompt: z.string().nullish(),
      meta: z.record(z.string(), z.any()).optional(),
      costCents: z.number().optional(),
```

- [ ] **Step 2: Persist it** — in the `prisma.mediaAsset.create` data, add:

```ts
          prompt: a.prompt ?? null,
          meta: a.meta ?? undefined,
          costCents: a.costCents ?? 0,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/worker/callback/route.ts
git commit -m "feat(web): persist media quality meta from worker callback"
```

---

## Phase C — Writer step + first comment (LLM)

### Task C1: Story-brief + firstComment schemas and types

**Files:**
- Modify: `apps/web/src/lib/llm/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/llm/__tests__/story-schema.test.ts
import { describe, it, expect } from "vitest";
import { storyBriefSchema, draftResponseSchema } from "@/lib/llm/types";

describe("storyBriefSchema", () => {
  it("parses a complete brief", () => {
    const v = storyBriefSchema.parse({
      story: "Explain the GLP-1 cycle calmly.",
      keyMessage: "Hunger returning on day 4-5 is often expected.",
      beats: ["peak", "fade", "reassurance"],
      ctaIntent: "Invite to see their cycle in-app.",
    });
    expect(v.beats.length).toBe(3);
  });
});

describe("draftResponseSchema", () => {
  it("accepts an optional firstComment", () => {
    const v = draftResponseSchema.parse({
      caption: "x", hashtags: [], recommendedFormat: "single",
      formatRationale: "y", slides: [{ role: "cover", headline: "h" }],
      firstComment: "Everything's free 👇\n🌐 gastric-iq.com",
    });
    expect(v.firstComment).toContain("gastric-iq.com");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/lib/llm/__tests__/story-schema.test.ts`
Expected: FAIL — `storyBriefSchema` not exported.

- [ ] **Step 3: Add the schemas/types** to `apps/web/src/lib/llm/types.ts`:

```ts
export const storyBriefSchema = z.object({
  story: z.string(),
  keyMessage: z.string(),
  beats: z.array(z.string()).default([]),
  ctaIntent: z.string(),
});
export type StoryBrief = z.infer<typeof storyBriefSchema>;
```

And in `draftResponseSchema`, add the `firstComment` field:

```ts
  slides: z.array(draftSlideSchema).min(1),
  firstComment: z.string().nullable().optional(),
  /** Narration script for reels (omitted for single/carousel). */
  voiceover: z.string().nullable().optional(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/lib/llm/__tests__/story-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/llm/types.ts apps/web/src/lib/llm/__tests__/story-schema.test.ts
git commit -m "feat(llm): storyBrief schema + optional firstComment on draft"
```

### Task C2: Story + firstComment prompts

**Files:**
- Modify: `apps/web/src/lib/llm/prompts.ts`

- [ ] **Step 1: Add `storyPrompt`** at the end of the file:

```ts
export function storyPrompt(
  brand: BrandContext,
  opts: { pillarName: string; research?: string; title?: string; angle?: string },
): { system: string; user: string } {
  return {
    system: brandPreamble(brand),
    user: `You are the writer. Decide the single story this post should tell today.
Pillar: "${opts.pillarName}".
${opts.research ? `Research / local context to weave in where natural:\n${opts.research}` : "No special local context today."}
${opts.title ? `Working title: ${opts.title}` : ""}
${opts.angle ? `Working angle: ${opts.angle}` : ""}

Respond as JSON:
{ "story": "1-2 sentences naming the narrative", "keyMessage": "the one thing the viewer should remember", "beats": ["ordered beat", "..."], "ctaIntent": "what we want them to do, framed as process not outcome" }`,
  };
}
```

- [ ] **Step 2: Extend `draftPrompt`** to accept a story brief and require a first
comment. Replace the `draftPrompt` signature and body with:

```ts
export function draftPrompt(
  brand: BrandContext,
  opts: { title: string; angle: string; format?: string; story?: import("./types").StoryBrief },
): { system: string; user: string } {
  const storyBlock = opts.story
    ? `\nStory to tell: ${opts.story.story}\nKey message: ${opts.story.keyMessage}\nBeats: ${opts.story.beats.join(" → ")}\nCTA intent: ${opts.story.ctaIntent}\n`
    : "";
  return {
    system: brandPreamble(brand),
    user: `Write a complete post for this idea:
Title: ${opts.title}
Angle: ${opts.angle}
${opts.format ? `Preferred format: ${opts.format}` : ""}${storyBlock}

Produce:
- caption: link-free caption (light tasteful emoji), value-first, no medical claims. End with a nudge, not a URL (EN "Try it free — links in the first comment 👇" / PT "É grátis pra testar — links no primeiro comentário 👇").
- firstComment: BOTH destinations + one post-specific question, exactly:
  "<EN: Everything's free to try 👇 / PT: Tudo grátis pra testar 👇>
  🌐 Web — gastric-iq.com
  📲 Android — play.google.com/store/apps/details?id=ca.reggiespace.gastric_iq
  <one short engagement question in the post's language>"
- hashtags: 4-8 relevant hashtags (no leading #).
- recommendedFormat: single | carousel | reel + formatRationale (one sentence).
- slides: ordered slides.
  - "carousel": 1 cover (eyebrow + short headline), 2-4 body (eyebrow + headline + 1-2 sentence body), 1 cta (headline = call to action).
  - "single": exactly 1 cover (eyebrow + headline).
  - "reel": 3-6 body slides (headline per scene) + a "voiceover" field with the full narration.

Respond as JSON matching:
{ "caption", "firstComment", "hashtags": [], "recommendedFormat", "formatRationale", "slides": [ { "role": "cover|body|cta", "eyebrow", "headline", "body", "imagePrompt": "short literal scene description for a background photo — food, ingredients, calm lifestyle objects; no people's bodies, no medical content, no text" } ], "voiceover" }`,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/llm/prompts.ts
git commit -m "feat(llm): writer storyPrompt + first-comment draft prompt"
```

### Task C3: `composeStory` on the provider

**Files:**
- Modify: `apps/web/src/lib/llm/provider.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/llm/__tests__/compose-story.test.ts
import { describe, it, expect } from "vitest";
import { getLlmProvider } from "@/lib/llm/provider";

const brand = {
  name: "Gastric IQ", locale: "en" as const, toneGuide: "calm",
  pillars: [{ name: "Protein & lean mass", description: "protein-first" }],
};

describe("composeStory (mock)", () => {
  it("returns a usable brief and feeds draft", async () => {
    const llm = getLlmProvider(); // mock when no OPENAI_API_KEY in test env
    const story = await llm.composeStory(brand, { pillarName: "Protein & lean mass" });
    expect(story.keyMessage.length).toBeGreaterThan(0);
    const draft = await llm.draft(brand, { title: "t", angle: "a", format: "single", story });
    expect(draft.firstComment).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/lib/llm/__tests__/compose-story.test.ts`
Expected: FAIL — `composeStory` is not a function.

- [ ] **Step 3: Extend the interface and both providers.**

In `provider.ts` imports, add `storyPrompt`:

```ts
import { ideasPrompt, draftPrompt, storyPrompt } from "./prompts";
import {
  draftResponseSchema,
  ideasResponseSchema,
  storyBriefSchema,
  type BrandContext,
  type DraftResponse,
  type Idea,
  type StoryBrief,
} from "./types";
```

Add to the `LlmProvider` interface:

```ts
  composeStory(
    brand: BrandContext,
    opts: { pillarName: string; research?: string; title?: string; angle?: string },
  ): Promise<StoryBrief>;
  draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string; story?: StoryBrief },
  ): Promise<DraftResponse>;
```

In `OpenAiProvider`, add the method and widen `draft`'s opts:

```ts
  async composeStory(
    brand: BrandContext,
    opts: { pillarName: string; research?: string; title?: string; angle?: string },
  ): Promise<StoryBrief> {
    const { system, user } = storyPrompt(brand, opts);
    const raw = await this.json(system, user);
    return storyBriefSchema.parse(raw);
  }

  async draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string; story?: StoryBrief },
  ): Promise<DraftResponse> {
    const { system, user } = draftPrompt(brand, opts);
    const raw = await this.json(system, user);
    return draftResponseSchema.parse(raw);
  }
```

In `MockProvider`, add `composeStory` and make `draft` emit a `firstComment`:

```ts
  async composeStory(
    brand: BrandContext,
    opts: { pillarName: string; research?: string; title?: string; angle?: string },
  ): Promise<StoryBrief> {
    const pt = brand.locale === "pt_BR";
    return {
      story: pt
        ? `Explicar com calma o tema "${opts.pillarName}".`
        : `Calmly explain "${opts.pillarName}".`,
      keyMessage: pt
        ? "O ciclo tem pico e queda — com base nos seus registros."
        : "The cycle peaks then fades — based on your logged data.",
      beats: pt ? ["pico", "queda", "tranquilizar"] : ["peak", "fade", "reassure"],
      ctaIntent: pt ? "Convidar a ver o próprio ciclo no app." : "Invite them to see their cycle in-app.",
    };
  }
```

In `MockProvider.draft`, change the signature to accept `story` and add a
`firstComment` to the returned object (right after `slides,`):

```ts
  async draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string; story?: StoryBrief },
  ): Promise<DraftResponse> {
```

and in the `return { ... }`:

```ts
      slides,
      firstComment: pt
        ? "Tudo grátis pra testar 👇\n🌐 Web — gastric-iq.com\n📲 Android — play.google.com/store/apps/details?id=ca.reggiespace.gastric_iq\nQual fase do ciclo você está sentindo hoje?"
        : "Everything's free to try 👇\n🌐 Web — gastric-iq.com\n📲 Android — play.google.com/store/apps/details?id=ca.reggiespace.gastric_iq\nWhere are you in your cycle today?",
      voiceover:
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/lib/llm/__tests__/compose-story.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full web suite to check for regressions**

Run: `pnpm -C apps/web test`
Expected: PASS (existing draft-schema test still green; `firstComment` is optional).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/llm/provider.ts apps/web/src/lib/llm/__tests__/compose-story.test.ts
git commit -m "feat(llm): composeStory writer step on OpenAI + Mock providers"
```

### Task C4: Persist firstComment in piece creation

**Files:**
- Modify: `apps/web/src/app/api/pieces/route.ts`

- [ ] **Step 1: Persist `firstComment`** — in the `prisma.contentPiece.create`
data block, add after `caption: draft.caption,`:

```ts
        caption: draft.caption,
        firstComment: draft.firstComment ?? null,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/pieces/route.ts
git commit -m "feat(web): persist generated firstComment on pieces"
```

---

## Phase D — Daily-run orchestrator

### Task D1: Cadence picker

**Files:**
- Create: `apps/web/src/lib/pipeline/cadence.ts`
- Test: `apps/web/src/lib/pipeline/__tests__/cadence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/pipeline/__tests__/cadence.test.ts
import { describe, it, expect } from "vitest";
import { pickCadence, runDateUTC } from "@/lib/pipeline/cadence";

const rows = [
  { weekday: 1, pillar: "A", format: "carousel" as const, networks: ["instagram"] },
  { weekday: 3, pillar: "B", format: "reel" as const, networks: ["instagram"] },
];

describe("pickCadence", () => {
  it("returns the row matching the weekday", () => {
    const monday = new Date("2026-06-22T12:00:00Z"); // Monday
    expect(pickCadence(rows, monday)?.pillar).toBe("A");
  });
  it("returns null on a day with no cadence", () => {
    const sunday = new Date("2026-06-21T12:00:00Z");
    expect(pickCadence(rows, sunday)).toBeNull();
  });
});

describe("runDateUTC", () => {
  it("zeroes the time component", () => {
    const d = runDateUTC(new Date("2026-06-22T18:30:00Z"));
    expect(d.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/cadence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cadence.ts`**

```ts
// apps/web/src/lib/pipeline/cadence.ts
import "server-only";

export interface CadenceRow {
  weekday: number;
  pillar: string;
  format: "single" | "carousel" | "reel";
  networks: string[];
}

/** The day's cadence entry, or null if the brand doesn't post that weekday. */
export function pickCadence(rows: CadenceRow[], when: Date): CadenceRow | null {
  const wd = when.getUTCDay();
  return rows.find((r) => r.weekday === wd) ?? null;
}

/** Normalize to a UTC date at midnight — the ContentRun dedupe key. */
export function runDateUTC(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/cadence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pipeline/cadence.ts apps/web/src/lib/pipeline/__tests__/cadence.test.ts
git commit -m "feat(pipeline): weekday cadence picker + run-date normalizer"
```

### Task D2: Research seam (stub)

**Files:**
- Create: `apps/web/src/lib/pipeline/research.ts`

- [ ] **Step 1: Implement the minimal seam** (no test — pure stub returning null;
the full brain is a later slice):

```ts
// apps/web/src/lib/pipeline/research.ts
import "server-only";

export interface ResearchResult {
  /** Free-text local/competitor/analytics context for the writer, or null. */
  summary: string | null;
}

/**
 * Seam for the future research/competitor/analytics brain. Minimal now: returns
 * no extra context. Later implementations enrich this without changing callers.
 */
export async function getResearch(_brandId: string, _date: Date): Promise<ResearchResult> {
  return { summary: null };
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/web/src/lib/pipeline/research.ts
git commit -m "feat(pipeline): research seam stub (getResearch)"
```

### Task D3: The orchestrator (one brand, one day)

**Files:**
- Create: `apps/web/src/lib/pipeline/run.ts`
- Test: `apps/web/src/lib/pipeline/__tests__/run.test.ts`

This function ties the pieces together: dedupe via `ContentRun`, research →
writer → ideate(persist) → generate(persist piece + firstComment) → claims-check
(pass→`review`/`draft`, fail→`blocked`) → enqueue render. Rendering itself is
fire-and-forget (the worker callback flips the piece to `review` once hosted), so
the orchestrator's job ends at "render enqueued / blocked".

- [ ] **Step 1: Write the failing test** (mock LLM via no OPENAI key; stub the
render dispatch through an injected `enqueueRender`)

```ts
// apps/web/src/lib/pipeline/__tests__/run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const upsertRun = vi.fn();
const findCadence = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    cadence: { findMany: (...a: unknown[]) => findCadence(...a) },
    contentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: (...a: unknown[]) => upsertRun(...a),
      update: vi.fn(),
    },
    pillar: { findFirst: vi.fn().mockResolvedValue({ id: "pillar1" }) },
    idea: { create: vi.fn().mockResolvedValue({ id: "idea1", title: "t", angle: "a" }), update: vi.fn() },
    contentPiece: { create: (...a: unknown[]) => create(...a) },
  },
}));

import { runDailyForBrand } from "@/lib/pipeline/run";

const brand = {
  id: "b1", name: "Gastric IQ", locale: "en" as const, publisher: "buffer" as const,
  context: { name: "Gastric IQ", locale: "en" as const, toneGuide: "calm",
    pillars: [{ name: "Protein & lean mass", description: "x" }] },
  defaultSkin: "mark_forward" as const,
};

beforeEach(() => { create.mockReset(); upsertRun.mockReset(); findCadence.mockReset(); });

describe("runDailyForBrand", () => {
  it("skips a day with no cadence", async () => {
    findCadence.mockResolvedValue([]); // no rows
    const enqueueRender = vi.fn();
    const res = await runDailyForBrand(brand, new Date("2026-06-21T12:00:00Z"), { enqueueRender });
    expect(res.skipped).toBe(true);
    expect(enqueueRender).not.toHaveBeenCalled();
  });

  it("creates a piece and enqueues render on a cadence day", async () => {
    findCadence.mockResolvedValue([
      { weekday: 1, pillar: "Protein & lean mass", format: "single", networks: ["instagram"] },
    ]);
    upsertRun.mockResolvedValue({ id: "run1" });
    create.mockResolvedValue({ id: "piece1", caption: "c", slides: [{ headline: "h" }] });
    const enqueueRender = vi.fn().mockResolvedValue(undefined);
    const res = await runDailyForBrand(brand, new Date("2026-06-22T12:00:00Z"), { enqueueRender });
    expect(res.skipped).toBe(false);
    expect(res.pieceId).toBe("piece1");
    expect(enqueueRender).toHaveBeenCalledWith("piece1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/run.test.ts`
Expected: FAIL — `runDailyForBrand` not found.

- [ ] **Step 3: Implement `run.ts`**

```ts
// apps/web/src/lib/pipeline/run.ts
import "server-only";
import { prisma } from "@/lib/db";
import { getLlmProvider } from "@/lib/llm/provider";
import { checkClaims } from "@/lib/claims/check";
import { getResearch } from "./research";
import { pickCadence, runDateUTC, type CadenceRow } from "./cadence";
import type { BrandContext } from "@/lib/llm/types";
import type { Skin } from "@/generated/prisma/enums";

export interface PipelineBrand {
  id: string;
  name: string;
  locale: "en" | "pt_BR";
  publisher: "buffer" | "zernio";
  context: BrandContext;
  defaultSkin: Skin;
}

export interface RunDeps {
  /** Enqueue rendering for a piece (defaults to the HTTP render route). */
  enqueueRender: (pieceId: string) => Promise<void>;
}

export interface RunOutcome {
  skipped: boolean;
  reason?: string;
  runId?: string;
  pieceId?: string;
  blocked?: boolean;
}

export async function runDailyForBrand(
  brand: PipelineBrand,
  when: Date,
  deps: RunDeps,
): Promise<RunOutcome> {
  const cadences = (await prisma.cadence.findMany({
    where: { brandId: brand.id },
  })) as unknown as CadenceRow[];
  const cadence = pickCadence(cadences, when);
  if (!cadence) return { skipped: true, reason: "no-cadence" };

  const runDate = runDateUTC(when);

  // Idempotency: one run per (brand, date, pillar).
  const existing = await prisma.contentRun.findUnique({
    where: { brandId_runDate_pillar: { brandId: brand.id, runDate, pillar: cadence.pillar } },
  });
  if (existing) return { skipped: true, reason: "already-run", runId: existing.id };

  const run = await prisma.contentRun.create({
    data: { brandId: brand.id, runDate, pillar: cadence.pillar, format: cadence.format, status: "running" },
  });

  try {
    const llm = getLlmProvider();

    // 1. Research → 2. Writer
    const research = await getResearch(brand.id, when);
    const story = await llm.composeStory(brand.context, {
      pillarName: cadence.pillar,
      research: research.summary ?? undefined,
    });

    // 3. Ideate (persist an Idea carrying the story brief)
    const matchedPillar = await prisma.pillar.findFirst({
      where: { brandId: brand.id, name: cadence.pillar },
    });
    const idea = await prisma.idea.create({
      data: {
        brandId: brand.id,
        pillarId: matchedPillar?.id ?? null,
        title: story.keyMessage.slice(0, 80),
        angle: story.story,
        recommendedFormat: cadence.format,
        insightsContext: research.summary ?? null,
        storyBrief: JSON.parse(JSON.stringify(story)),
        status: "selected",
      },
    });

    // 4. Generate the piece from the story brief
    const draft = await llm.draft(brand.context, {
      title: idea.title,
      angle: idea.angle,
      format: cadence.format,
      story,
    });
    const fullText = [draft.caption, ...draft.slides.map((s) => s.headline ?? "")].join(" ");
    const claims = checkClaims(fullText);

    const piece = await prisma.contentPiece.create({
      data: {
        brandId: brand.id,
        ideaId: idea.id,
        runId: run.id,
        format: draft.recommendedFormat,
        caption: draft.caption,
        firstComment: draft.firstComment ?? null,
        hashtags: draft.hashtags,
        formatRationale: draft.formatRationale,
        voiceover: draft.voiceover ?? null,
        claims: JSON.parse(JSON.stringify(claims)),
        status: claims.canSchedule ? "draft" : "blocked",
        slides: {
          create: draft.slides.map((s, i) => ({
            index: i,
            role: s.role,
            skin: brand.defaultSkin,
            eyebrow: s.eyebrow ?? null,
            headline: s.headline ?? null,
            body: s.body ?? null,
            imagePrompt: s.imagePrompt ?? null,
          })),
        },
      },
      include: { slides: { orderBy: { index: "asc" } } },
    });
    await prisma.idea.update({ where: { id: idea.id }, data: { status: "used" } });

    if (!claims.canSchedule) {
      await prisma.contentRun.update({ where: { id: run.id }, data: { status: "complete" } });
      return { skipped: false, runId: run.id, pieceId: piece.id, blocked: true };
    }

    // 5. Enqueue render (worker callback flips piece → review once hosted)
    await deps.enqueueRender(piece.id);
    await prisma.contentRun.update({ where: { id: run.id }, data: { status: "complete" } });
    return { skipped: false, runId: run.id, pieceId: piece.id, blocked: false };
  } catch (err) {
    await prisma.contentRun.update({
      where: { id: run.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/run.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pipeline/run.ts apps/web/src/lib/pipeline/__tests__/run.test.ts
git commit -m "feat(pipeline): runDailyForBrand orchestrator (research→writer→generate→lint→render)"
```

### Task D4: Render enqueue helper

**Files:**
- Create: `apps/web/src/lib/pipeline/enqueue-render.ts`

- [ ] **Step 1: Implement the default render enqueuer** (mirrors the existing
`/api/pieces/[id]/render` dispatch so the cron path reuses the same worker call):

```ts
// apps/web/src/lib/pipeline/enqueue-render.ts
import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { JobKind } from "@/generated/prisma/enums";

/** Create a RenderJob and dispatch it to the worker (fire-and-forget). */
export async function enqueueRender(pieceId: string): Promise<void> {
  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: { slides: { orderBy: { index: "asc" } }, brand: { include: { brandKit: true } } },
  });
  if (!piece) throw new Error(`enqueueRender: unknown piece ${pieceId}`);

  const kind: JobKind = piece.format === "single" ? "image" : (piece.format as JobKind);
  const job = await prisma.renderJob.create({ data: { pieceId, kind, status: "queued" } });

  const workerUrl = env.workerBaseUrl();
  const secret = env.workerSharedSecret();
  const payload = {
    jobId: job.id,
    pieceId,
    kind,
    slides: piece.slides.map((s) => ({
      index: s.index, role: s.role, skin: s.skin,
      eyebrow: s.eyebrow, headline: s.headline, body: s.body, imagePrompt: s.imagePrompt,
    })),
    brandKit: {
      logoPath: piece.brand.brandKit?.logoPath ?? "",
      tokens: piece.brand.brandKit?.tokens,
      fonts: piece.brand.brandKit?.fonts,
      defaultSkin: piece.brand.brandKit?.defaultSkin,
      artDirection: piece.brand.brandKit?.artDirection ?? "warm_lifestyle",
      voiceId: piece.brand.brandKit?.voiceId ?? "",
    },
    voiceover: piece.voiceover,
    locale: piece.brand.locale,
    voiceGender: piece.voiceGender ?? "female",
    motion: piece.motion,
  };

  await fetch(`${workerUrl}/render/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "X-Worker-Secret": secret } : {}) },
    body: JSON.stringify(payload),
  });
  await prisma.renderJob.update({ where: { id: job.id }, data: { status: "running" } });
  await prisma.contentPiece.update({ where: { id: pieceId }, data: { status: "rendering" } });
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/web/src/lib/pipeline/enqueue-render.ts
git commit -m "feat(pipeline): shared render enqueue helper"
```

### Task D5: Cron entrypoint route

**Files:**
- Create: `apps/web/src/app/api/cron/daily-run/route.ts`
- Modify: `apps/web/src/lib/env.ts`

- [ ] **Step 1: Add `cronSecret` to env** — in `apps/web/src/lib/env.ts`, inside
the `env` object:

```ts
  workerSharedSecret: () => optional("WORKER_SHARED_SECRET"),
  cronSecret: () => optional("CRON_SECRET"),
```

- [ ] **Step 2: Implement the route** — iterates all brands, runs the
orchestrator per brand, returns a per-brand outcome summary:

```ts
// apps/web/src/app/api/cron/daily-run/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { loadBrand } from "@/lib/brand";
import { runDailyForBrand, type RunOutcome } from "@/lib/pipeline/run";
import { enqueueRender } from "@/lib/pipeline/enqueue-render";

export async function POST(req: Request) {
  const secret = env.cronSecret();
  if (secret) {
    if (req.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const when = new Date();
  const brands = await prisma.brand.findMany({ include: { brandKit: true } });

  const results: Record<string, RunOutcome | { error: string }> = {};
  for (const b of brands) {
    const loaded = await loadBrand(b.id);
    if (!loaded) { results[b.key] = { error: "brand context unavailable" }; continue; }
    try {
      results[b.key] = await runDailyForBrand(
        {
          id: b.id, name: b.name, locale: b.locale,
          publisher: b.publisher as "buffer" | "zernio",
          context: loaded.context,
          defaultSkin: b.brandKit?.defaultSkin ?? "mark_forward",
        },
        when,
        { enqueueRender },
      );
    } catch (err) {
      results[b.key] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ranAt: when.toISOString(), results });
}
```

- [ ] **Step 3: Verify `loadBrand` returns `.context`** — open
`apps/web/src/lib/brand.ts` and confirm it returns an object with a `context`
field of type `BrandContext` (used by the existing ideas/suggest route). If the
shape differs, adapt the two `loaded.context` references to match.

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/cron/daily-run/route.ts apps/web/src/lib/env.ts
git commit -m "feat(web): /api/cron/daily-run entrypoint (secret-guarded)"
```

---

## Phase E — First-comment publishing

### Task E1: Thread firstComment through the publisher port

**Files:**
- Modify: `apps/web/src/lib/publishers/types.ts`
- Modify: `apps/web/src/lib/publishers/zernio.ts`
- Modify: `apps/web/src/lib/publishers/buffer.ts`

- [ ] **Step 1: Add `firstComment` to `ScheduleOptions`** in `types.ts`:

```ts
export interface ScheduleOptions {
  caption: string;
  firstComment?: string;
  hashtags: string[];
```

- [ ] **Step 2: Send it from Zernio** — in `zernio.ts`, both `schedule` and
`publishNow` bodies, add `platformSpecificData` with the first comment. In
`schedule`:

```ts
      body: JSON.stringify({
        accountId: opts.channelId,
        network: opts.network,
        caption: [opts.caption, ...opts.hashtags].join("\n\n"),
        mediaUrls: opts.mediaUrls,
        scheduledAt: opts.scheduledAt.toISOString(),
        idempotencyKey: opts.idempotencyKey,
        ...(opts.firstComment ? { platformSpecificData: { firstComment: opts.firstComment } } : {}),
      }),
```

And the same `...(opts.firstComment ? { platformSpecificData: { firstComment: opts.firstComment } } : {})` line in the `publishNow` body and in `dryRun`'s returned object.

- [ ] **Step 3: Buffer — leave first comment deferred but explicit.** Open
`buffer.ts`; at the top of `schedule` and `publishNow`, add a one-line note so
the deferral is visible (no behavior change — EN first comment is a later slice):

```ts
    // NOTE: Buffer's simple create API doesn't expose first comment; EN
    // first-comment is deferred to a GraphQL-based slice (spec §scope).
```

- [ ] **Step 4: Typecheck & commit**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/web/src/lib/publishers/types.ts apps/web/src/lib/publishers/zernio.ts apps/web/src/lib/publishers/buffer.ts
git commit -m "feat(publish): thread firstComment to Zernio; document Buffer deferral"
```

### Task E2: Pass firstComment from the schedule route

**Files:**
- Modify: `apps/web/src/app/api/schedule/route.ts`

- [ ] **Step 1: Include `firstComment` in the publisher opts** — in the `opts`
object built before publishing, add:

```ts
  const opts = {
    caption: piece.caption,
    firstComment: piece.firstComment ?? undefined,
    hashtags: piece.hashtags,
```

- [ ] **Step 2: Persist the claims snapshot on schedule** — the route already
recomputes `claims`; store it so the review panel stays current. After the
`checkClaims` call, before the `canSchedule` guard returns, update the piece:

```ts
  const claims = checkClaims(fullText);
  await prisma.contentPiece.update({ where: { id: pieceId }, data: { claims: JSON.parse(JSON.stringify(claims)) } });
  if (!claims.canSchedule) {
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/schedule/route.ts
git commit -m "feat(web): schedule attaches firstComment + persists claims snapshot"
```

---

## Phase F — Daily queue review UI

### Task F1: Queue data endpoint

**Files:**
- Modify: `apps/web/src/app/api/pieces/route.ts`

- [ ] **Step 1: Support a `runDate` filter** so the queue can fetch today's
drafts. In the `GET` handler, read the param and widen the `where`:

```ts
  const status = searchParams.get("status");
  const runDate = searchParams.get("runDate"); // YYYY-MM-DD (UTC)
  const cursor = searchParams.get("cursor");

  const runFilter = runDate
    ? { run: { is: { runDate: new Date(`${runDate}T00:00:00.000Z`) } } }
    : {};

  const pieces = await prisma.contentPiece.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      ...(status ? { status: status as never } : {}),
      ...runFilter,
    },
```

- [ ] **Step 2: Include media + first comment in the response** — extend the
`include` so the queue can preview without an extra round-trip:

```ts
    include: {
      slides: { orderBy: { index: "asc" }, take: 1 },
      mediaAssets: { select: { url: true, type: true } },
      idea: { select: { title: true } },
      brand: { select: { name: true, locale: true } },
    },
```

- [ ] **Step 3: Typecheck & commit**

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

```bash
git add apps/web/src/app/api/pieces/route.ts
git commit -m "feat(web): queue list supports runDate filter + media/firstComment"
```

### Task F2: Queue page (server) + client

**Files:**
- Create: `apps/web/src/app/(app)/queue/page.tsx`
- Create: `apps/web/src/app/(app)/queue/queue-client.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx` (sidebar link)

- [ ] **Step 1: Server page** — fetch today's pieces and pass to the client.
Follow the existing `pieces/page.tsx` data-loading pattern (server component
using `prisma` directly + `guard`). Create `page.tsx`:

```tsx
// apps/web/src/app/(app)/queue/page.tsx
import { prisma } from "@/lib/db";
import { runDateUTC } from "@/lib/pipeline/cadence";
import { QueueClient } from "./queue-client";

export default async function QueuePage() {
  const runDate = runDateUTC(new Date());
  const pieces = await prisma.contentPiece.findMany({
    where: { run: { is: { runDate } } },
    include: {
      mediaAssets: { select: { url: true, type: true } },
      brand: { select: { name: true, locale: true } },
      slides: { orderBy: { index: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  return <QueueClient pieces={JSON.parse(JSON.stringify(pieces))} dateLabel={runDate.toISOString().slice(0, 10)} />;
}
```

- [ ] **Step 2: Client component** — render status chips, media preview, caption,
first comment, and links to the existing piece detail (where Approve/schedule
already lives). Create `queue-client.tsx`:

```tsx
// apps/web/src/app/(app)/queue/queue-client.tsx
"use client";
import Link from "next/link";

type Piece = {
  id: string; status: string; caption: string; firstComment: string | null;
  format: string; brand: { name: string; locale: string };
  mediaAssets: { url: string; type: string }[];
  slides: { headline: string | null }[];
};

const CHIP: Record<string, string> = {
  review: "bg-emerald-100 text-emerald-800",
  blocked: "bg-red-100 text-red-800",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-violet-100 text-violet-800",
  failed: "bg-orange-100 text-orange-800",
  draft: "bg-zinc-100 text-zinc-700",
  rendering: "bg-amber-100 text-amber-800",
};

export function QueueClient({ pieces, dateLabel }: { pieces: Piece[]; dateLabel: string }) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Today&apos;s queue — {dateLabel}</h1>
      {pieces.length === 0 && <p className="text-sm text-zinc-500">No drafts generated yet for today.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pieces.map((p) => {
          const media = p.mediaAssets[0];
          return (
            <Link key={p.id} href={`/pieces/${p.id}`} className="block rounded-lg border p-3 hover:shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{p.brand.name} · {p.format}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${CHIP[p.status] ?? "bg-zinc-100"}`}>{p.status}</span>
              </div>
              {media?.type === "video" ? (
                <video src={media.url} className="w-full rounded mb-2" muted controls />
              ) : media ? (
                <img src={media.url} alt="" className="w-full rounded mb-2" />
              ) : (
                <div className="w-full aspect-[4/5] rounded bg-zinc-100 mb-2 grid place-items-center text-xs text-zinc-400">no media yet</div>
              )}
              <p className="text-sm line-clamp-3">{p.caption}</p>
              {p.firstComment && <p className="mt-1 text-xs text-zinc-500 line-clamp-2">💬 {p.firstComment}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add a sidebar link** — in `apps/web/src/app/(app)/layout.tsx`,
add a nav entry pointing to `/queue` labeled "Queue" (match the existing nav
item markup for "Pieces"/"Ideate").

- [ ] **Step 4: Verify it renders** — start the dev server and load `/queue`.

Run: `pnpm -C apps/web dev` (then visit `http://localhost:3000/queue`)
Expected: page renders; with no `ContentRun` today, shows the empty state.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/queue" "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): daily queue page with status chips + media preview"
```

### Task F3: Show story brief + first comment in piece detail

**Files:**
- Modify: `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx`
- Modify: `apps/web/src/app/(app)/pieces/[id]/page.tsx`

- [ ] **Step 1: Load `firstComment` + idea.storyBrief** — in `page.tsx`, ensure
the piece query `include`s the idea and selects `firstComment` (add to the
existing `prisma.contentPiece.findUnique` include/select; include
`idea: { select: { storyBrief: true, title: true } }`).

- [ ] **Step 2: Render them** — in `piece-review.tsx`, add a "Story" block (from
`idea.storyBrief`) and a "First comment" block (from `piece.firstComment`) near
the caption display. Use the existing caption block's markup/classes as the
template so styling stays consistent. The story brief renders
`story`, `keyMessage`, and `beats.join(" → ")`.

- [ ] **Step 3: Verify** — load an existing piece detail page; confirm the
caption still renders and the new blocks appear when data is present (and are
hidden when null).

Run: `pnpm -C apps/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/pieces/[id]/piece-review.tsx" "apps/web/src/app/(app)/pieces/[id]/page.tsx"
git commit -m "feat(web): show story brief + first comment in piece detail"
```

---

## Phase G — Deployment & docs

### Task G1: Cron sidecar

**Files:**
- Create: `infra/cron/run-daily.sh`
- Create: `infra/cron/crontab`
- Modify: `infra/docker-compose.yml`

- [ ] **Step 1: Create the trigger script**

```sh
# infra/cron/run-daily.sh
#!/bin/sh
set -eu
: "${WEB_BASE_URL:=http://web:3000}"
: "${CRON_SECRET:=}"
echo "[cron] daily-run $(date -u +%FT%TZ)"
curl -fsS -X POST "$WEB_BASE_URL/api/cron/daily-run" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json" \
  || echo "[cron] daily-run failed"
```

- [ ] **Step 2: Create the crontab** (08:00 UTC daily — adjust per market later):

```
0 8 * * * /scripts/run-daily.sh >> /var/log/cron.log 2>&1
```

- [ ] **Step 3: Add the `scheduler` service** to `infra/docker-compose.yml`
(alpine + busybox crond; mounts the scripts; shares the web network):

```yaml
  scheduler:
    image: alpine:3.20
    depends_on:
      - web
    environment:
      WEB_BASE_URL: "http://web:3000"
      CRON_SECRET: "${CRON_SECRET}"
    volumes:
      - ./cron/run-daily.sh:/scripts/run-daily.sh:ro
      - ./cron/crontab:/etc/crontabs/root:ro
    command: >
      sh -c "apk add --no-cache curl >/dev/null && chmod +x /scripts/run-daily.sh && crond -f -l 8"
    restart: unless-stopped
```

- [ ] **Step 4: Validate compose**

Run: `docker compose -f infra/docker-compose.yml config >/dev/null && echo OK`
Expected: `OK` (no schema errors).

- [ ] **Step 5: Commit**

```bash
chmod +x infra/cron/run-daily.sh
git add infra/cron infra/docker-compose.yml
git commit -m "feat(infra): daily-run cron sidecar service"
```

### Task G2: Worker S3 env in compose + `.env.example`

**Files:**
- Modify: `infra/docker-compose.yml` (worker `environment`)
- Modify: `.env.example`

- [ ] **Step 1: Pass S3/storage env to the worker** — in the `worker` service's
`environment:` block in `infra/docker-compose.yml`, add:

```yaml
      STORAGE_BACKEND: "${STORAGE_BACKEND:-local}"
      MEDIA_S3_BUCKET: "${MEDIA_S3_BUCKET:-}"
      MEDIA_S3_REGION: "${MEDIA_S3_REGION:-garage}"
      MEDIA_S3_ENDPOINT: "${MEDIA_S3_ENDPOINT:-}"
      MEDIA_PUBLIC_BASE_URL: "${MEDIA_PUBLIC_BASE_URL:-}"
      AWS_ACCESS_KEY_ID: "${AWS_ACCESS_KEY_ID:-}"
      AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_ACCESS_KEY:-}"
```

- [ ] **Step 2: Document the new vars** — append to `.env.example`:

```
# --- Media hosting (Garage S3) ---
STORAGE_BACKEND=local            # local | s3
MEDIA_S3_BUCKET=
MEDIA_S3_REGION=garage
MEDIA_S3_ENDPOINT=
MEDIA_PUBLIC_BASE_URL=           # optional CDN base; else <endpoint>/<bucket>/<key>
AWS_ACCESS_KEY_ID=               # Garage key (write to media prefixes only)
AWS_SECRET_ACCESS_KEY=

# --- Daily pipeline cron ---
CRON_SECRET=                     # shared secret for POST /api/cron/daily-run
```

- [ ] **Step 3: Validate compose & commit**

Run: `docker compose -f infra/docker-compose.yml config >/dev/null && echo OK`
Expected: `OK`.

```bash
git add infra/docker-compose.yml .env.example
git commit -m "chore(infra): pass S3/cron env to worker; document new vars"
```

### Task G3: Full-suite green + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the whole web suite**

Run: `pnpm -C apps/web test`
Expected: PASS (all suites).

- [ ] **Step 2: Run the whole worker suite**

Run: `cd apps/worker && python -m pytest -q`
Expected: PASS.

- [ ] **Step 3: Manual pipeline smoke (mock LLM, local storage)** — with the
stack up (`./start.sh` or docker compose), trigger a run and confirm a draft
appears in the queue:

Run: `curl -fsS -X POST http://localhost:3000/api/cron/daily-run -H "x-cron-secret: $CRON_SECRET"`
Expected: JSON with per-brand `results`; on a cadence weekday, a `pieceId` and
`blocked:false`; visiting `/queue` shows the new draft moving rendering→review.

- [ ] **Step 4: Final commit (if any doc tweaks)**

```bash
git add -A
git commit -m "test: full-suite green for Garage + daily pipeline foundation" || echo "nothing to commit"
```

---

## Acceptance criteria mapping (from the spec)

1. **Worker uploads to Garage; public URL 200 + content-type verified before
   hosted** → Tasks B2, B3, B4.
2. **`daily-run` produces a review-ready draft per brand, idempotent on re-run**
   → Tasks A1, D1, D3, D5; idempotency via `ContentRun @@unique` (A1) + the
   `findUnique` guard (D3).
3. **Non-compliant caption is `blocked` and never schedules** → Task D3 (claims
   gate → `blocked`); existing schedule-route block guard.
4. **Daily queue UI shows status/media/caption/firstComment/claims; Approve
   schedules (Buffer ≤10 cap), Edit+re-lint, Discard** → Tasks F1–F3 (queue +
   detail reuse the existing schedule route, which keeps the Buffer cap).
5. **Cron sidecar triggers `daily-run` on dokploy** → Task G1.
6. **Content integrity — no truncation; within platform limits** → caption/first
   comment generated whole (C2/C3); on-slide text wrapping is enforced by the
   renderer's `wrap()`; surfaced for review in F2/F3. *(Caption length-limit unit
   test is added in Task F-note below.)*
7. **Media quality — visible, pro-grade text/image/audio/video; host probes and
   fails broken assets** → Tasks B1, B4.

> **Spec-coverage note (added during self-review):** AC #6's explicit
> caption-length check needs a home. Add it as **Task E3** below.

### Task E3: Caption length guard (AC #6)

**Files:**
- Create: `apps/web/src/lib/pipeline/limits.ts`
- Test: `apps/web/src/lib/pipeline/__tests__/limits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/pipeline/__tests__/limits.test.ts
import { describe, it, expect } from "vitest";
import { captionWithinLimit, IG_CAPTION_MAX } from "@/lib/pipeline/limits";

describe("captionWithinLimit", () => {
  it("passes a short caption", () => {
    expect(captionWithinLimit("short", ["instagram"]).ok).toBe(true);
  });
  it("fails an over-limit instagram caption", () => {
    const long = "x".repeat(IG_CAPTION_MAX + 1);
    const r = captionWithinLimit(long, ["instagram"]);
    expect(r.ok).toBe(false);
    expect(r.overBy).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/limits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `limits.ts`**

```ts
// apps/web/src/lib/pipeline/limits.ts
import "server-only";

export const IG_CAPTION_MAX = 2200;
export const FB_CAPTION_MAX = 63206;

const MAX_BY_NETWORK: Record<string, number> = {
  instagram: IG_CAPTION_MAX,
  facebook: FB_CAPTION_MAX,
};

export function captionWithinLimit(
  caption: string,
  networks: string[],
): { ok: boolean; overBy: number } {
  let worst = 0;
  for (const n of networks) {
    const max = MAX_BY_NETWORK[n] ?? IG_CAPTION_MAX;
    worst = Math.max(worst, caption.length - max);
  }
  return { ok: worst <= 0, overBy: Math.max(0, worst) };
}
```

- [ ] **Step 4: Enforce in the orchestrator** — in `run.ts`, after computing
`fullText`/`claims` and before creating the piece, block over-limit captions:

```ts
import { captionWithinLimit } from "./limits";
// ...after `const claims = checkClaims(fullText);`
const lengthOk = captionWithinLimit(draft.caption, cadence.networks).ok;
const blocked = !claims.canSchedule || !lengthOk;
```

Then use `blocked` for the piece `status` (`blocked ? "blocked" : "draft"`) and
the early-return branch, replacing the two `claims.canSchedule` references.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/lib/pipeline/__tests__/limits.test.ts src/lib/pipeline/__tests__/run.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/pipeline/limits.ts apps/web/src/lib/pipeline/__tests__/limits.test.ts apps/web/src/lib/pipeline/run.ts
git commit -m "feat(pipeline): caption length guard blocks over-limit drafts"
```

---

## Done criteria

All tasks committed on `feat/garage-autopilot`; `pnpm -C apps/web test` and
`python -m pytest` green; a manual `daily-run` on a cadence weekday produces a
hosted, review-ready draft in `/queue`; a forced non-compliant caption lands
`blocked`. Garage endpoint/bucket/key are supplied via dokploy env at deploy and
the storage backend flipped to `s3` (`STORAGE_BACKEND=s3`).
