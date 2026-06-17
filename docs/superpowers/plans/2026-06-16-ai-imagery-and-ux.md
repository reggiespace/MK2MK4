# AI Imagery + UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black-screen reel with real fal.ai per-slide imagery composited under legible text, add opt-in reel motion, and fix the preview/navigation/status gaps.

**Architecture:** The web app (OpenAI key) writes a safety-guardrailed image prompt per slide. The Python worker calls fal.ai to generate a background image per slide (cached), composites scrim + text + logo on top, and for opt-in reels animates the background via image-to-video with a static text overlay. Worker callbacks persist `MediaAsset` rows and link them to slides. Everything degrades gracefully to the existing flat-card / Ken-Burns paths.

**Tech Stack:** Next.js 16 (web), Prisma 7 + Postgres, Python 3.12 FastAPI worker, Pillow, ffmpeg, fal.ai (`fal-client`), ElevenLabs. Tests: `pytest` (worker), `vitest` (web).

> **Next.js note:** Per `apps/web/AGENTS.md`, this Next.js version has breaking changes — read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing web route/page code.

---

## File Structure

**Worker (Python)**
- Create `apps/worker/app/renderer/imagery.py` — fal.ai image generation + image-to-video + on-disk cache.
- Modify `apps/worker/app/renderer/vessel.py` — optional `background_image` + transparent text-overlay mode + per-skin logo chip.
- Modify `apps/worker/app/renderer/reel.py` — motion-aware assembly.
- Modify `apps/worker/app/main.py` — request models + per-slide image generation wiring.
- Modify `apps/worker/app/config.py` — fal model ids.
- Create `apps/worker/tests/` — pytest suite + `conftest.py`.
- Modify `apps/worker/pyproject.toml` — add `fal-client`, dev `pytest`.

**Web (TypeScript)**
- Create `apps/web/src/lib/imagery/prompt.ts` — prompt builder (art direction + guardrails).
- Modify `apps/web/src/lib/llm/types.ts` — `imagePrompt` on draft slide.
- Modify `apps/web/src/lib/llm/prompts.ts` + `provider.ts` (mock) — emit `imagePrompt`.
- Modify `apps/web/src/app/api/pieces/route.ts` — persist `imagePrompt`, fix skin rule.
- Modify `apps/web/src/app/api/pieces/[id]/render/route.ts` — payload additions.
- Modify `apps/web/src/app/api/worker/callback/route.ts` — persist assets + links + cost.
- Modify `apps/web/src/app/api/pieces/[id]/route.ts` — accept `motion` PATCH.
- Create `apps/web/src/app/(app)/pieces/page.tsx` — Pieces library.
- Modify `apps/web/src/app/(app)/layout.tsx` — sidebar "Pieces" link.
- Modify `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx` — preview parity, motion toggle, status polling, back-nav.
- Modify `apps/web/prisma/schema.prisma` + `seed.ts` — `Slide.imagePrompt`, `BrandKit.artDirection`, `ContentPiece.motion`.
- Create `apps/web/vitest.config.ts` + `apps/web/package.json` test script.

---

## Phase 0 — Test infrastructure

### Task 0a: Worker pytest + fal-client

**Files:**
- Modify: `apps/worker/pyproject.toml`
- Create: `apps/worker/tests/__init__.py`, `apps/worker/tests/conftest.py`, `apps/worker/tests/test_smoke.py`

- [ ] **Step 1: Add deps**

In `apps/worker/pyproject.toml`, add `"fal-client>=0.5"` to `dependencies` and change the dev extra to:

```toml
[project.optional-dependencies]
dev = ["ruff>=0.7", "pytest>=8.0"]
```

- [ ] **Step 2: Install**

Run: `cd apps/worker && .venv/bin/pip install -e ".[dev]"`
Expected: installs `fal-client` and `pytest` without error.

- [ ] **Step 3: Create test scaffolding**

`apps/worker/tests/__init__.py`: empty file.

`apps/worker/tests/conftest.py`:

```python
import sys
from pathlib import Path

# Make the worker package importable from the tests dir.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

`apps/worker/tests/test_smoke.py`:

```python
def test_app_imports():
    from app.main import app
    assert app.title == "Gastric IQ Media Worker"
```

- [ ] **Step 4: Run**

Run: `cd apps/worker && .venv/bin/pytest tests/test_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/pyproject.toml apps/worker/tests
git commit -m "test(worker): add pytest scaffolding and fal-client dependency"
```

### Task 0b: Web vitest

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`, `apps/web/src/lib/imagery/__tests__/smoke.test.ts`

- [ ] **Step 1: Install vitest**

Run: `cd apps/web && pnpm add -D vitest`
Expected: vitest added to devDependencies.

- [ ] **Step 2: Add config**

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: Add script**

In `apps/web/package.json` `"scripts"`, add: `"test": "vitest run"`.

- [ ] **Step 4: Smoke test**

`apps/web/src/lib/imagery/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run**

Run: `cd apps/web && pnpm test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/pnpm-lock.yaml apps/web/src/lib/imagery/__tests__/smoke.test.ts
git commit -m "test(web): add vitest setup"
```

---

## Phase 1 — Imagery core

### Task 1: Schema — imagePrompt, artDirection, motion

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Modify: `apps/web/prisma/seed.ts:69` (BrandKit block)

- [ ] **Step 1: Add enum + fields**

In `schema.prisma`, after the `Skin` enum, add:

```prisma
enum ArtDirection {
  warm_lifestyle
  editorial_illustration
  cinematic
}
```

In `model BrandKit`, after `defaultSkin`, add:

```prisma
  artDirection ArtDirection @default(warm_lifestyle)
```

In `model ContentPiece`, after `voiceGender`, add:

```prisma
  motion      Boolean     @default(false) // reel AI motion (image-to-video) opt-in
```

In `model Slide`, after `body`, add:

```prisma
  imagePrompt   String?    @db.Text // literal scene description for fal.ai
```

- [ ] **Step 2: Migrate**

Run: `cd apps/web && pnpm prisma migrate dev --name imagery_fields`
Expected: new migration created and applied; client regenerated.

- [ ] **Step 3: Seed default art direction**

In `seed.ts`, in the BrandKit create data (both brands), add `artDirection: "warm_lifestyle",`.

- [ ] **Step 4: Re-seed**

Run: `cd apps/web && pnpm prisma db seed`
Expected: seed completes without error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma
git commit -m "feat(db): add imagePrompt, artDirection, and motion fields"
```

### Task 2: Web prompt builder + guardrails

**Files:**
- Create: `apps/web/src/lib/imagery/prompt.ts`
- Test: `apps/web/src/lib/imagery/__tests__/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/imagery/__tests__/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildImagePrompt, GUARDRAIL_SUFFIX, ART_DIRECTION_PREAMBLE } from "@/lib/imagery/prompt";

describe("buildImagePrompt", () => {
  it("includes the art-direction preamble for the brand style", () => {
    const out = buildImagePrompt("a bowl of oats", "warm_lifestyle");
    expect(out).toContain(ART_DIRECTION_PREAMBLE.warm_lifestyle);
    expect(out).toContain("a bowl of oats");
  });

  it("always appends the safety guardrail suffix", () => {
    const out = buildImagePrompt("anything", "cinematic");
    expect(out).toContain(GUARDRAIL_SUFFIX);
  });

  it("falls back to warm_lifestyle for an unknown style", () => {
    const out = buildImagePrompt("scene", "bogus" as never);
    expect(out).toContain(ART_DIRECTION_PREAMBLE.warm_lifestyle);
  });

  it("returns guardrail-only baseline when scene is empty", () => {
    const out = buildImagePrompt("", "warm_lifestyle");
    expect(out).toContain(GUARDRAIL_SUFFIX);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm test src/lib/imagery/__tests__/prompt.test.ts`
Expected: FAIL — cannot find module `@/lib/imagery/prompt`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/imagery/prompt.ts`:

```ts
export type ArtDirection = "warm_lifestyle" | "editorial_illustration" | "cinematic";

export const ART_DIRECTION_PREAMBLE: Record<ArtDirection, string> = {
  warm_lifestyle:
    "Warm, bright editorial lifestyle photography. Natural light, shallow depth of field, fresh whole foods and calm wellness scenes.",
  editorial_illustration:
    "Modern editorial illustration, soft flat shapes, organic linework, calm earthy palette (moss green, slate blue, cream).",
  cinematic:
    "Cinematic still, soft directional light, gentle film grain, muted earthy palette, tasteful and trustworthy mood.",
};

// Strict guardrails for a health brand — these subjects must never be depicted.
export const GUARDRAIL_SUFFIX =
  "Do not depict: human bodies in before/after or weight-loss contexts, weighing scales or weight numbers, " +
  "medical or clinical settings, pills/syringes/medical devices, or any specific health outcome. " +
  "No text, words, letters, logos, or watermarks anywhere in the image.";

/** Compose the final fal.ai prompt from a slide scene + brand art direction. */
export function buildImagePrompt(scene: string, artDirection: ArtDirection): string {
  const preamble = ART_DIRECTION_PREAMBLE[artDirection] ?? ART_DIRECTION_PREAMBLE.warm_lifestyle;
  const subject = scene.trim() ? `Scene: ${scene.trim()}.` : "Scene: abstract on-brand background texture.";
  return `${preamble} ${subject} ${GUARDRAIL_SUFFIX}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm test src/lib/imagery/__tests__/prompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/imagery
git commit -m "feat(web): art-direction image prompt builder with safety guardrails"
```

### Task 3: LLM emits imagePrompt; persist on piece creation

**Files:**
- Modify: `apps/web/src/lib/llm/types.ts:17-22` (draftSlideSchema)
- Modify: `apps/web/src/lib/llm/prompts.ts` (draft instruction)
- Modify: `apps/web/src/lib/llm/provider.ts` (mock provider output)
- Modify: `apps/web/src/app/api/pieces/route.ts:17-20` (skin rule) and `:95-104` (slide create)
- Test: `apps/web/src/lib/llm/__tests__/draft-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/llm/__tests__/draft-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftSlideSchema } from "@/lib/llm/types";

describe("draftSlideSchema", () => {
  it("accepts an imagePrompt", () => {
    const parsed = draftSlideSchema.parse({
      role: "cover",
      headline: "Hi",
      imagePrompt: "a bowl of oats on a wooden table",
    });
    expect(parsed.imagePrompt).toBe("a bowl of oats on a wooden table");
  });

  it("treats imagePrompt as optional", () => {
    const parsed = draftSlideSchema.parse({ role: "body" });
    expect(parsed.imagePrompt ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm test src/lib/llm/__tests__/draft-schema.test.ts`
Expected: FAIL — `imagePrompt` stripped/undefined assertion mismatch.

- [ ] **Step 3: Add field to schema**

In `types.ts`, inside `draftSlideSchema`, add after `body`:

```ts
  imagePrompt: z.string().nullable().optional(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm test src/lib/llm/__tests__/draft-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the draft prompt instruction**

In `prompts.ts`, in the draft system/user instructions that describe slide JSON, add a line instructing the model: *"For each slide include `imagePrompt`: a short, literal description of a photographable background scene (food, ingredients, calm lifestyle) relevant to the slide — no people's bodies, no medical content, no text."* Match the file's existing prompt style.

- [ ] **Step 6: Make the mock provider emit imagePrompt**

In `provider.ts`, in the mock `draft()` slide objects, add an `imagePrompt` to each (e.g. `imagePrompt: "fresh vegetables and grains on a bright kitchen counter"`). This keeps local/dev runs realistic.

- [ ] **Step 7: Persist imagePrompt + fix skin rule**

In `pieces/route.ts`, change `skinForRole` so body slides are not hard-forced to dark:

```ts
function skinForRole(role: SlideRole, brandDefault: Skin): Skin {
  if (role === "cover") return brandDefault;
  if (role === "cta") return brandDefault;
  return brandDefault; // imagery + scrim provide contrast; no forced near-black
}
```

In the `slides.create` map, add `imagePrompt: s.imagePrompt ?? null,`.

- [ ] **Step 8: Run full web tests**

Run: `cd apps/web && pnpm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/llm apps/web/src/app/api/pieces/route.ts
git commit -m "feat(web): LLM emits imagePrompt; persist it and relax forced-dark skin"
```

### Task 4: Worker fal.ai image generation + cache

**Files:**
- Modify: `apps/worker/app/config.py`
- Create: `apps/worker/app/renderer/imagery.py`
- Test: `apps/worker/tests/test_imagery.py`

- [ ] **Step 1: Add model ids to config**

In `config.py`, in `Settings`, add:

```python
    fal_image_model: str = os.getenv("FAL_IMAGE_MODEL", "fal-ai/flux/schnell")
    fal_video_model: str = os.getenv("FAL_VIDEO_MODEL", "fal-ai/bytedance/seedance/v1/lite/image-to-video")
```

- [ ] **Step 2: Write the failing test**

`apps/worker/tests/test_imagery.py`:

```python
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

    def fake_call(prompt, model, size):
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

    def boom(prompt, model, size):
        raise RuntimeError("fal down")

    monkeypatch.setattr(imagery, "_fal_image", boom)
    out = imagery.generate_background("scene", "warm_lifestyle", (1080, 1350), api_key="k")
    assert out is None
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_imagery.py -v`
Expected: FAIL — module/functions not defined.

- [ ] **Step 4: Implement imagery.py**

`apps/worker/app/renderer/imagery.py`:

```python
"""fal.ai image generation + image-to-video, with on-disk caching.

Returns None on any failure so callers can fall back to the flat-card /
Ken-Burns paths. Never raises into the render pipeline.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("worker.imagery")


def _cache_dir() -> Path:
    d = Path(get_settings().storage_dir) / "cache" / "img"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _key(art_direction: str, prompt: str, size: tuple[int, int]) -> str:
    raw = f"{art_direction}|{prompt}|{size[0]}x{size[1]}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _download(url: str) -> bytes:
    return httpx.get(url, timeout=60).content


def _fal_image(prompt: str, model: str, size: tuple[int, int]) -> bytes:
    """Call fal.ai text-to-image and return PNG/JPEG bytes."""
    import fal_client

    w, h = size
    result = fal_client.subscribe(
        model,
        arguments={
            "prompt": prompt,
            "image_size": {"width": w, "height": h},
            "num_images": 1,
        },
    )
    return _download(result["images"][0]["url"])


def generate_background(
    prompt: str,
    art_direction: str,
    size: tuple[int, int],
    api_key: str | None,
) -> bytes | None:
    """Return a generated background image (bytes) or None on failure/no key."""
    if not api_key:
        log.info("no FAL_KEY; skipping image generation")
        return None

    cache_dir = _cache_dir()
    cache_path = cache_dir / f"{_key(art_direction, prompt, size)}.png"
    if cache_path.exists():
        return cache_path.read_bytes()

    try:
        data = _fal_image(prompt, get_settings().fal_image_model, size)
        cache_path.write_bytes(data)
        return data
    except Exception as exc:  # never break the pipeline
        log.error("fal image generation failed: %s", exc)
        return None
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_imagery.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/worker/app/config.py apps/worker/app/renderer/imagery.py apps/worker/tests/test_imagery.py
git commit -m "feat(worker): fal.ai image generation with on-disk cache and safe fallback"
```

### Task 5: Compositing — background image + scrim

**Files:**
- Modify: `apps/worker/app/renderer/vessel.py` (`render_slide` signature + background path)
- Test: `apps/worker/tests/test_vessel.py`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/test_vessel.py`:

```python
import io

from PIL import Image

from app.renderer.vessel import render_slide


def _bg(size, color=(200, 120, 60)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_renders_over_background_image():
    out = render_slide(
        skin="dark", role="body", eyebrow="EAT", headline="Fiber first",
        body="Start meals with vegetables.", size=(1080, 1350),
        background_image=_bg((1080, 1350)),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    assert img.size == (1080, 1350)
    # Top region keeps background hue (orange-ish); not flat near-black.
    top_pixel = img.getpixel((540, 60))
    assert top_pixel[0] > 100  # red channel from the orange bg survives


def test_flat_card_when_no_background():
    out = render_slide(
        skin="dark", role="body", eyebrow=None, headline="Hi", body=None,
        size=(1080, 1350),
    )
    img = Image.open(io.BytesIO(out)).convert("RGB")
    assert img.size == (1080, 1350)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_vessel.py -v`
Expected: FAIL — `render_slide() got an unexpected keyword argument 'background_image'`.

- [ ] **Step 3: Implement**

In `vessel.py`, add helpers and extend `render_slide`. Add near the other helpers:

```python
def _cover_fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale + center-crop an image to exactly fill size."""
    tw, th = size
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def _text_scrim(size: tuple[int, int]) -> Image.Image:
    """Bottom-up dark gradient so text stays legible over any photo."""
    w, h = size
    scrim = Image.new("RGBA", size, (0, 0, 0, 0))
    px = scrim.load()
    for y in range(h):
        t = y / h
        alpha = int(200 * max(0.0, (t - 0.35) / 0.65))  # ramp from 35% down
        for x in range(w):
            px[x, y] = (8, 12, 18, alpha)
    return scrim
```

Change the `render_slide` signature to add `background_image: bytes | None = None,` before `size`. Replace the background-selection block (currently the `if skin_tokens["gradient"]: ... else: Image.new(...)`) with:

```python
    if background_image:
        base = Image.open(io.BytesIO(background_image)).convert("RGB")
        img = _cover_fit(base, size).convert("RGB")
        img = Image.alpha_composite(img.convert("RGBA"), _text_scrim(size)).convert("RGB")
    elif skin_tokens["gradient"]:
        img = _gradient_background(size, skin_tokens["gradient"])
    else:
        img = Image.new("RGB", size, skin_tokens["bg"])
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_vessel.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/app/renderer/vessel.py apps/worker/tests/test_vessel.py
git commit -m "feat(worker): composite slide text over background image with legibility scrim"
```

### Task 6: Wire image generation into worker render paths

**Files:**
- Modify: `apps/worker/app/main.py` (request models + image/carousel/reel paths)
- Modify: `apps/worker/app/renderer/reel.py` (`render_reel` accepts per-slide backgrounds)
- Test: `apps/worker/tests/test_render_paths.py`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/test_render_paths.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_render_paths.py -v`
Expected: FAIL — unexpected/ missing fields.

- [ ] **Step 3: Extend request models**

In `main.py`: add `imagePrompt: str | None = None` to `SlideInput`; add `artDirection: str = "warm_lifestyle"` to `BrandKitInput`; add `motion: bool = False` to `RenderRequest`.

- [ ] **Step 4: Generate a background per slide**

In `main.py`, add a helper and use it in `_render_image_bg` and `_render_carousel_bg`:

```python
from .renderer.imagery import generate_background

def _bg_for_slide(slide, art_direction, size):
    if not slide.imagePrompt:
        return None
    return generate_background(
        slide.imagePrompt, art_direction, size, get_settings().fal_key
    )
```

In both paths, compute `bg = _bg_for_slide(slide, req.brandKit.artDirection, PORTRAIT_SIZE)` and pass `background_image=bg` to `render_slide(...)`. Set the asset `engine` to `"fal"` when `bg is not None` else `"template"`, and include `"prompt": slide.imagePrompt` in the asset dict.

- [ ] **Step 5: Pass backgrounds + art direction into the reel**

In `reel.py`, change `render_reel(...)` to accept `art_direction: str = "warm_lifestyle"` and, inside the slide loop, generate a background per slide and pass it to `render_slide(..., background_image=bg)`:

```python
from .imagery import generate_background
...
        art_direction = brand_kit.get("artDirection", "warm_lifestyle")
        for i, slide in enumerate(slides):
            bg = None
            if slide.get("imagePrompt"):
                bg = generate_background(
                    slide["imagePrompt"], art_direction, REEL_SIZE, settings.fal_key
                )
            png = render_slide(
                skin=slide.get("skin", "dark"), role=slide.get("role", "body"),
                eyebrow=slide.get("eyebrow"), headline=slide.get("headline"),
                body=slide.get("body"), logo_path=logo_path,
                background_image=bg, size=REEL_SIZE,
            )
```

In `main.py` `_render_reel_bg`, the `brand_kit` dict already carries `artDirection` (model field). No signature change needed at the call site beyond passing the dict (already done via `req.brandKit.model_dump(by_alias=True)`).

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_render_paths.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/app/main.py apps/worker/app/renderer/reel.py apps/worker/tests/test_render_paths.py
git commit -m "feat(worker): generate fal backgrounds per slide across image/carousel/reel"
```

### Task 7: Render payload + callback persistence

**Files:**
- Modify: `apps/web/src/app/api/pieces/[id]/render/route.ts:49-67`
- Modify: `apps/web/src/app/api/worker/callback/route.ts`
- Test: manual integration (mock engine)

- [ ] **Step 1: Extend the render payload**

In `render/route.ts`, in the `slides.map`, add `imagePrompt: s.imagePrompt,`. In `brandKit`, add `artDirection: piece.brand.brandKit?.artDirection ?? "warm_lifestyle",`. In the top-level payload, add `motion: piece.motion,`.

- [ ] **Step 2: Read the callback route**

Run: `cat apps/web/src/app/api/worker/callback/route.ts`
Confirm how it currently records assets and updates the piece.

- [ ] **Step 3: Persist assets, link slides, roll up cost**

Update the callback handler so that for each asset in the payload it:
- creates a `MediaAsset` with `pieceId`, `type` (`image`/`video`), `url`, `engine` (`fal`/`template`/`elevenlabs`), `prompt`, `costCents` (from asset `costCents` if present, else 0), and `meta`;
- if the asset has a `slideIndex`, links it: `prisma.slide.update({ where: { pieceId_index: { pieceId, index: slideIndex } }, data: { mediaAssetId: asset.id } })`;
- after creating assets, sets `ContentPiece.status` to `review` and `costCents` to the summed asset cost (plus existing cost).

Match the file's existing auth/secret-verification pattern.

- [ ] **Step 4: Manual integration check**

With the worker running using the mock/no-key path (`FAL_KEY` unset → flat cards, engine `template`), render a carousel from the UI and confirm: `MediaAsset` rows created, `Slide.mediaAssetId` populated, piece status → `review`.

Run: `cd apps/web && pnpm prisma studio` (inspect MediaAsset + Slide) — or query via the app.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/pieces/[id]/render/route.ts apps/web/src/app/api/worker/callback/route.ts
git commit -m "feat(web): pass imagery payload and persist generated assets + slide links + cost"
```

---

## Phase 2 — Reel motion

### Task 8: Worker image-to-video

**Files:**
- Modify: `apps/worker/app/renderer/imagery.py` (add `animate_background`)
- Test: `apps/worker/tests/test_animate.py`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/test_animate.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_animate.py -v`
Expected: FAIL — `animate_background` not defined.

- [ ] **Step 3: Implement**

Append to `imagery.py`:

```python
MOTION_PROMPT = (
    "Subtle cinematic motion: very slow camera push-in and gentle parallax. "
    "Keep the scene calm and natural; minimal movement, no morphing."
)


def _fal_upload(data: bytes, content_type: str) -> str:
    import fal_client
    return fal_client.upload(data, content_type)


def _fal_video(image_url: str, model: str, prompt: str) -> bytes:
    import fal_client
    result = fal_client.subscribe(
        model,
        arguments={"image_url": image_url, "prompt": prompt, "duration": "5"},
    )
    video = result.get("video") or {}
    return _download(video["url"])


def animate_background(
    image_bytes: bytes,
    art_direction: str,
    size: tuple[int, int],
    api_key: str | None,
) -> bytes | None:
    """Animate a still background into an MP4 clip. None on failure/no key."""
    if not api_key:
        return None
    try:
        url = _fal_upload(image_bytes, "image/png")
        return _fal_video(url, get_settings().fal_video_model, MOTION_PROMPT)
    except Exception as exc:
        log.error("fal image-to-video failed: %s", exc)
        return None
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_animate.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/app/renderer/imagery.py apps/worker/tests/test_animate.py
git commit -m "feat(worker): fal.ai image-to-video with safe fallback"
```

### Task 9: Transparent text-overlay rendering

**Files:**
- Modify: `apps/worker/app/renderer/vessel.py` (add `transparent` mode)
- Test: `apps/worker/tests/test_vessel_overlay.py`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/test_vessel_overlay.py`:

```python
import io

from PIL import Image

from app.renderer.vessel import render_slide


def test_transparent_overlay_has_alpha():
    out = render_slide(
        skin="dark", role="body", eyebrow="EAT", headline="Fiber first",
        body="Veg first.", size=(1080, 1920), transparent=True,
    )
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGBA"
    # A pixel in the empty top area should be fully transparent.
    assert img.getpixel((540, 40))[3] == 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_vessel_overlay.py -v`
Expected: FAIL — unexpected keyword `transparent`.

- [ ] **Step 3: Implement**

In `render_slide`, add parameter `transparent: bool = False,`. At the top of the function, when `transparent` is True, build an RGBA transparent canvas with only the scrim + text/logo (skip the solid/photo background):

```python
    if transparent:
        img = Image.new("RGBA", size, (0, 0, 0, 0))
        img = Image.alpha_composite(img, _text_scrim(size))
        draw = ImageDraw.Draw(img)
        # ... reuse the existing text/eyebrow/headline/body/logo drawing below ...
        # at the end:
        out = io.BytesIO(); img.save(out, format="PNG"); return out.getvalue()
```

Refactor so the text-drawing block is shared between the opaque and transparent paths (extract an inner `_draw_content(draw, img, ...)` if cleaner). The transparent path returns RGBA PNG; the opaque path keeps returning RGB PNG.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_vessel_overlay.py tests/test_vessel.py -v`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/app/renderer/vessel.py apps/worker/tests/test_vessel_overlay.py
git commit -m "feat(worker): transparent text-overlay rendering mode for motion reels"
```

### Task 10: Motion-aware reel assembly

**Files:**
- Modify: `apps/worker/app/renderer/reel.py` (`render_reel` motion branch)
- Test: `apps/worker/tests/test_reel_motion.py`

- [ ] **Step 1: Write the failing test**

`apps/worker/tests/test_reel_motion.py`:

```python
import app.renderer.reel as reel


def test_motion_uses_clip_when_animation_succeeds(monkeypatch, tmp_path):
    # Stub fal + ffmpeg boundaries; assert the motion branch is taken.
    monkeypatch.setattr(reel, "generate_background", lambda *a, **k: b"PNG")
    monkeypatch.setattr(reel, "animate_background", lambda *a, **k: b"MP4")
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_reel_motion.py -v`
Expected: FAIL — `render_reel` has no `motion` param / `_assemble` not defined.

- [ ] **Step 3: Refactor reel assembly behind a seam**

In `reel.py`, add `motion: bool = False` to `render_reel`. Extract the ffmpeg assembly into a private `_assemble(clips, overlays, audio_path, motion)` where:
- when `motion` is True and every slide animated successfully: `clips` are MP4 clip paths and `overlays` are transparent text PNG paths; ffmpeg `overlay`s each text PNG onto its clip (scaled/cropped to 1080×1920, looped/trimmed to `SLIDE_DURATION_S`), then xfades + muxes audio.
- when `motion` is False: keep the existing looped-still + zoompan Ken Burns path using composited frames.

In the slide loop, generate the still bg; if `motion`, call `animate_background` — if *any* slide returns `None`, set `motion = False` for the whole reel (consistent path) and use composited still frames; otherwise write clip + transparent overlay files. Keep `progress_callback` updates.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_reel_motion.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire motion through main.py**

In `main.py` `_render_reel_bg`, pass `motion=req.motion` into `render_reel(...)`.

- [ ] **Step 6: Run worker suite**

Run: `cd apps/worker && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/app/renderer/reel.py apps/worker/app/main.py apps/worker/tests/test_reel_motion.py
git commit -m "feat(worker): motion-aware reel assembly with Ken Burns fallback"
```

### Task 11: Motion toggle UI + persistence

**Files:**
- Modify: `apps/web/src/app/api/pieces/[id]/route.ts` (accept `motion` in PATCH)
- Modify: `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx` (toggle in reel panel)

- [ ] **Step 1: Accept motion in PATCH**

Read `route.ts`; add `motion: z.boolean().optional()` to its PATCH body schema and include it in the `prisma.contentPiece.update` data when present. Match existing patterns.

- [ ] **Step 2: Add the toggle**

In `piece-review.tsx`, add `motion` to the `Piece` type. In the reel `voiceover-section`, add an "Animate (AI motion)" switch that calls `PATCH /api/pieces/:id` with `{ motion }`, optimistic-updates local state, and shows the note: *"Costs more and takes a few minutes."* Off by default.

- [ ] **Step 3: Manual verification**

Open a reel piece, toggle motion on, reload — confirm it persists. (DB check via Prisma Studio if needed.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/pieces/[id]/route.ts apps/web/src/app/(app)/pieces/[id]/piece-review.tsx
git commit -m "feat(web): per-piece reel motion toggle"
```

---

## Phase 3 — Logo

### Task 12: Logo asset + per-skin chip compositing

**Files:**
- Add asset: `assets/brands/logo-iq-transparent.png` (operator-provided)
- Modify: `apps/worker/app/renderer/vessel.py` (logo block)
- Test: `apps/worker/tests/test_logo.py`

- [ ] **Step 1: Confirm the asset exists**

Run: `ls -la assets/brands/logo-iq-transparent.png`
Expected: file present (operator added it). If absent, the logo block must no-op without error (covered by test).

- [ ] **Step 2: Write the failing test**

`apps/worker/tests/test_logo.py`:

```python
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/worker && .venv/bin/pytest tests/test_logo.py -v`
Expected: `test_logo_chip_on_dark` FAILS (no chip yet); missing-logo test may already pass.

- [ ] **Step 4: Implement the chip**

In the logo block of `render_slide`, when `skin == "dark"`, draw a light rounded chip behind the logo before pasting:

```python
            if skin == "dark":
                chip_pad = 16
                draw.rounded_rectangle(
                    [pad - chip_pad, pad - chip_pad,
                     pad + logo_w + chip_pad, pad + logo_h + chip_pad],
                    radius=20, fill=(236, 230, 214, 235),
                )
            img.paste(logo, (pad, pad), logo)
```

(Ensure the working image is RGBA where compositing the chip alpha is needed, or draw the chip opaque.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/worker && .venv/bin/pytest tests/test_logo.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add assets/brands/logo-iq-transparent.png apps/worker/app/renderer/vessel.py apps/worker/tests/test_logo.py
git commit -m "feat(worker): composite brand logo with per-skin contrast chip"
```

---

## Phase 4 — Preview parity

### Task 13: Web preview matches renderer

**Files:**
- Modify: `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx` (`SKIN_CONFIG`, real image already handled)

- [ ] **Step 1: Align placeholder colors**

In `piece-review.tsx`, update `SKIN_CONFIG` so the *placeholder* (no-image) state matches the Python renderer: `dark.bg = "#0E141B"` (flat, not the misleading gradient), `dark.accent = "#94AE8A"`, `light`/`mark_forward` to their `vessel.py` token values. Keep the scrim consistent with `_text_scrim` direction.

- [ ] **Step 2: Confirm real-image path**

The `SlidePreview` already renders `imageUrl` when present (an asset is linked). Verify the rendered image now appears once Task 7's callback links `Slide.mediaAssetId`.

- [ ] **Step 3: Manual verification**

Render a carousel (mock or real). Confirm: before render, the placeholder card colors match the exported PNGs; after render, the real generated image shows in the carousel.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(app)/pieces/[id]/piece-review.tsx
git commit -m "fix(web): align slide preview placeholder with renderer output"
```

---

## Phase 5 — Navigation & status

### Task 14: Pieces library + sidebar link

**Files:**
- Create: `apps/web/src/app/(app)/pieces/page.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Read Next.js docs note**

Read `apps/web/node_modules/next/dist/docs/` for the current server-component/page conventions before editing.

- [ ] **Step 2: Create the Pieces page**

`apps/web/src/app/(app)/pieces/page.tsx`: a server component that loads pieces (mirror the dashboard query but without `take: 8`; support an optional `?brandId=`/`?status=` filter) and renders the existing `piece-list` / `piece-row` markup with links to `/pieces/[id]`. Reuse the dashboard's row structure for visual consistency.

- [ ] **Step 3: Add sidebar link**

In `layout.tsx`, add between Dashboard and Ideate:

```tsx
          <li><Link href="/pieces" className="nav-link">Pieces</Link></li>
```

- [ ] **Step 4: Manual verification**

Run the app; click "Pieces"; confirm the full list renders and rows link into the review page.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(app)/pieces/page.tsx apps/web/src/app/(app)/layout.tsx
git commit -m "feat(web): pieces library page and sidebar link"
```

### Task 15: Fix back navigation

**Files:**
- Modify: `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx:241`

- [ ] **Step 1: Repoint the back link**

Change `<Link href="/ideate" className="back-link">← Back</Link>` to `href="/pieces"`.

- [ ] **Step 2: Manual verification**

From a piece, click "← Back" → lands on the Pieces library.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(app)/pieces/[id]/piece-review.tsx
git commit -m "fix(web): back link goes to pieces library"
```

### Task 16: Render-status polling + auto-swap

**Files:**
- Modify: `apps/web/src/app/(app)/pieces/[id]/piece-review.tsx`

- [ ] **Step 1: Add polling**

In `piece-review.tsx`, when `latestJob?.status` is `queued`/`running` (or right after `startRender`), poll `GET /api/pieces/:id/render` every ~3s via `useEffect` + `setInterval`. Update `piece.renderJobs[0]` (status + progress) on each tick; stop polling on `done`/`failed`.

- [ ] **Step 2: Show progress + auto-load assets**

Render a progress bar from `latestJob.progress`. On `done`, fetch the fresh piece (`GET /api/pieces/:id` or re-fetch assets) and update `mediaAssets` + slide links so the image/video appears without a manual refresh. (Confirm `GET /api/pieces/[id]/route.ts` returns assets; if not, include them.)

- [ ] **Step 3: Manual verification**

Start a render; watch the progress bar advance and the media appear automatically when the job completes (use the mock/template path for a fast loop).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(app)/pieces/[id]/piece-review.tsx
git commit -m "feat(web): poll render status and auto-load finished media"
```

---

## Self-Review

**Spec coverage:**
- Image generation service → Task 4. Compositing/scrim → Task 5. Prompt + safety → Tasks 2–3. Art-direction setting → Task 1 (+ payload Task 6/7). Render data flow → Tasks 6–7. Preview parity → Task 13. Navigation/status → Tasks 14–16. Logo → Task 12. Reel motion (schema/worker/UI) → Tasks 1, 8, 9, 10, 11. Test infra → Task 0. All spec sections mapped.
- **Skin-rule root cause** (forced dark bodies) → fixed in Task 3 Step 7.

**Placeholder scan:** No TBD/TODO. UI tasks (11, 13, 14, 15, 16) use concrete file changes + manual verification rather than brittle component tests — intentional given no DOM test harness; pure logic (prompt builder, schema, worker) is fully TDD'd.

**Type consistency:** `generate_background(prompt, art_direction, size, api_key)` and `animate_background(image_bytes, art_direction, size, api_key)` consistent across Tasks 4/6/8/10. `render_slide(..., background_image=, transparent=, size=)` consistent across Tasks 5/9/12. Request fields `imagePrompt` / `artDirection` / `motion` consistent across web (Tasks 1/3/7/11) and worker (Task 6). `_assemble(clips, overlays, audio, motion)` consistent in Task 10.

**Settings note:** `Settings` attributes are class-level; the `test_returns_none_without_key` passes `api_key=None` directly rather than mutating settings, so it does not depend on monkeypatching class attributes.
