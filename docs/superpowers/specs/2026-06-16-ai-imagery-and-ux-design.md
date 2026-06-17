# AI Imagery + UX Overhaul — Design Spec

**Date:** 2026-06-16
**Project:** Gastric IQ Social Content Studio (mk2mk4)
**Status:** Approved for planning

## Problem

The app generates ideas, copy, voiceover, and assembles reels end to end — but the
output reel is "a big black screen with a perfect voice and a label at the bottom."

Root cause (confirmed by tracing the pipeline): **there is no imagery layer in the
system.** Slides are flat solid-color cards rendered by Pillow
([`vessel.py`](../../../apps/worker/app/renderer/vessel.py)). Compounding factors:

1. The `dark` skin background is `#0E141B` (near-black), and
   [`pieces/route.ts:17-20`](../../../apps/web/src/app/api/pieces/route.ts) forces
   **every non-cover slide to `dark`** — so reel bodies are black by construction.
2. The `FAL_KEY` is set in `.env` and read into `config.fal_key`, but **no code uses
   it.** The planned fal.ai per-slide imagery (a Phase 2 item) was never built.
3. `assets/brands/` is empty, so the logo paste silently skips.
4. The web preview draws a *richer* gradient + scrim than the Python renderer actually
   outputs, so the on-screen preview looks better than the exported MP4 (preview lies).
5. Navigation friction: no Pieces library in the sidebar, "← Back" hardcoded to
   `/ideate`, and render status never auto-updates (manual refresh required to see
   results).

## Goals

- Generate a real AI background image per slide via fal.ai, composited under legible
  text — eliminating the black-screen reel.
- Keep imagery **brand-safe** for a health brand with strict prompt guardrails.
- Make art direction a **switchable brand setting**.
- Make the on-screen preview match the rendered output.
- Fix navigation and render-status visibility.

## Non-goals

- Video/motion generation (still images + existing Ken Burns motion only).
- Multi-user/teams, research brain (remain future phases).
- Changing the publishing/scheduling or claims-check engines.

## Decisions (locked)

- **Image prompts come from the LLM** that writes the slides (web side, where the
  OpenAI key lives). The worker only consumes a prompt + style and calls fal.ai.
- **AI imagery applies to all formats**: single image, carousel, reel.
- **Art direction** is a per-brand setting with presets: `warm_lifestyle` (default),
  `editorial_illustration`, `cinematic`. (Abstract dropped per operator.)
- **Strict safety guardrails** on every prompt: no before/after bodies, no
  scales/weight numbers, no clinical/medical depiction, no specific outcomes, no
  embedded text in the image.
- **Same logo for both brands**, full-color emblem with the "Gastric IQ" wordmark
  baked in. On `dark` slides the logo sits on a subtle light chip for contrast.
- Graceful fallback: if fal.ai fails or the key is missing, fall back to the current
  solid-color card so the pipeline never hard-breaks.

## Architecture & components

### 1. Image generation service (worker)
New `apps/worker/app/renderer/imagery.py`:
- `generate_background(prompt: str, art_direction: str, size: tuple[int,int]) -> bytes | None`
- Calls fal.ai (FLUX-class model; model id configurable via env, default chosen at
  implementation time against current fal docs).
- **Cache by prompt hash** on disk (`storage/cache/img/<hash>.png`) so re-renders of an
  unchanged piece don't re-pay.
- Returns `None` on failure/missing key → caller falls back to the flat card.
- Returns cost metadata for `MediaAsset.costCents`.

### 2. Compositing (worker)
`render_slide` in [`vessel.py`](../../../apps/worker/app/renderer/vessel.py) gains an
optional `background_image: bytes | None`:
- When present: draw the photo (cover-fit/crop to canvas), then a **legibility scrim**
  (gradient darkening behind the bottom text zone), then the existing eyebrow /
  headline / body / accent bar / logo on top.
- Logo placement: bare on light/cinematic; on a subtle light rounded chip on `dark`.
- When absent: current flat-card behavior (the fallback).

### 3. Prompt generation + safety (web)
- **Schema:** add `Slide.imagePrompt String?` (Prisma migration).
- **LLM:** extend `draftSlideSchema` ([`llm/types.ts`](../../../apps/web/src/lib/llm/types.ts))
  with an optional `imagePrompt`, and update the draft prompt
  ([`llm/prompts.ts`](../../../apps/web/src/lib/llm/prompts.ts)) to emit a concise,
  literal scene description per slide.
- **Builder:** new `apps/web/src/lib/imagery/prompt.ts` composes the final prompt =
  art-direction style preamble + slide scene + **hard guardrail suffix** (forbidden
  subjects). This runs server-side so the worker receives a finished, safe prompt.
- `pieces/route.ts` persists `imagePrompt` per slide on creation.
- **Skin rule fix:** stop forcing all body slides to `dark`; let the brand default skin
  (and image presence) drive contrast.

### 4. Brand art-direction setting
- **Schema:** add `BrandKit.artDirection` enum (`warm_lifestyle | editorial_illustration
  | cinematic`, default `warm_lifestyle`); seed both brands.
- Editable from Settings.
- Passed through the render payload to the worker.

### 5. Render data flow
- `pieces/[id]/render/route.ts` payload: add `imagePrompt` to each slide and
  `artDirection` to `brandKit`.
- Worker `SlideInput` gains `imagePrompt`; `BrandKitInput` gains `artDirection`.
- Worker generates an image per slide (cached), composites, saves each as a
  `MediaAsset` (`engine: fal`, `prompt`, `costCents`, `meta`).
- **Callback** ([`api/worker/callback`](../../../apps/web/src/app/api/worker/callback))
  persists `MediaAsset` rows, links `Slide.mediaAssetId` by slide index, sets the reel
  video asset, and rolls per-asset cost into `ContentPiece.costCents`.

### 6. Preview = output parity (web)
- [`piece-review.tsx`](../../../apps/web/src/app/(app)/pieces/[id]/piece-review.tsx):
  `SlidePreview` shows the real generated image once available; the placeholder state's
  `SKIN_CONFIG` colors/scrim are aligned to the Python renderer so the empty state no
  longer over-promises.

### 7. Navigation & render status (web)
- **Pieces library:** new `/(app)/pieces/page.tsx` listing/filtering pieces (uses the
  existing `GET /api/pieces`), plus a "Pieces" link in the sidebar
  ([`(app)/layout.tsx`](../../../apps/web/src/app/(app)/layout.tsx)).
- **Back nav:** change the hardcoded "← Back → /ideate" to the Pieces library.
- **Render status polling:** the review page polls `GET /api/pieces/[id]/render` (or
  job status) while a job is running, shows a progress bar, and auto-swaps in the
  finished image/video — no manual refresh.

### 8. Logo
- Place `assets/brands/logo-iq-transparent.png` (operator-provided, transparent PNG).
- Wire `BrandKit.logoPath` so it composites with per-skin chip handling (component 2).

## Error handling

- fal.ai failure/missing key → flat-card fallback; job still completes; asset recorded
  with `engine: template`.
- Image cache keyed by prompt hash; corrupt/missing cache entries regenerate.
- Worker callback failures are logged; job status reflects `failed` with the error.
- Strict guardrail suffix is always appended regardless of LLM output.

## Testing

- **Worker (pytest):** prompt builder produces guardrail suffix; `generate_background`
  returns `None` on missing key; compositing places scrim + text over a stub image;
  cache hit avoids a second API call.
- **Web (unit):** `lib/imagery/prompt.ts` always includes forbidden-subject clause and
  the selected art-direction preamble; `draftSlideSchema` accepts/defaults
  `imagePrompt`.
- **Integration:** render a reel with the mock image engine → MP4 has non-black frames
  with composited text; `MediaAsset` rows + `Slide.mediaAssetId` linked; preview shows
  the real image; cost rolled up.
- **Manual:** generate a piece per format per art-direction preset; verify logo
  legibility on each skin; verify status polling + auto-swap.

## Phasing (for the implementation plan)

1. **Imagery core** — schema (`Slide.imagePrompt`, `BrandKit.artDirection`), prompt
   builder + LLM emit, worker `imagery.py`, compositing + scrim, callback persistence,
   fallback. (Fixes the black screen.)
2. **Logo** — place asset, per-skin chip compositing.
3. **Preview parity** — align web preview to renderer output.
4. **Navigation & status** — Pieces library, back-nav fix, render-status polling.

## Open implementation details (resolved during planning)

- Exact fal.ai model id + request shape — confirm against current fal docs.
- Whether to also offer a per-piece art-direction override (default: brand-level only).
