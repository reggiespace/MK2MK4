# Guided Creation Wizard + Algorithm-Aware Reels — Design

**Date:** 2026-07-21
**Status:** Approved, pending implementation plan

## Why

Today's Ideate flow lets the AI infer format (carousel/reel/single/story) and lets a
template be picked twice — once, non-bindingly, before a draft exists, and again after
in the review screen. Neither choice is guaranteed to survive: `POST /api/pieces`
currently persists `draft.recommendedFormat` (the LLM's own pick), not the format the
caller requested, so even an explicit override can be silently discarded.

The target flow is a strict, user-driven sequence:

1. Choose Account (Gastric IQ / Gastric IQ Brasil)
2. Choose Style (carousel, reel, single image, story)
3. Choose Template
4. Supply a theme/topic, or ask AI to suggest one
5. AI writes the content
6. AI creates the assets to fill the template
7. User reviews/approves

Separately, research into Instagram's Reels ranking signals (watch time/completion
rate dominant, then sends-per-reach, then likes-per-reach; burned-in captions raise
watch time since most reels are watched muted; 15–30s runtime with a hook in the first
1.5–2s; loopable endings; weight-loss/bariatric content is a commonly shadow-throttled
category even without a formal violation) surfaces a second, related gap: reels
today have no enforced hook/pacing structure and no burned-in captions, both
directly correlated with reach for this content category.

This spec combines both: making style/template a binding, sequential, pre-generation
choice, and using that same template concept to carry algorithm-aware structure and
production requirements for reels.

## Non-goals

- Content-pillar rotation / posting-cadence tracking or enforcement (out of scope;
  flagged as a possible future project).
- A distinct "approve" action separate from "Schedule" (not requested; current
  approve-via-schedule behavior is kept).
- Making reel template definitions user-editable/DB-driven — they're a small static
  registry in code for this phase.
- Changing the claims-check engine's hard-block logic — only its prompt-level
  guardrails grow.

## Current-state gap analysis

| Target step | Current state |
|---|---|
| 1. Pick account | Implemented — dashboard + Ideate brand-picker |
| 2. Pick style | **Gap** — AI infers `recommendedFormat` per idea; a caller-supplied `format` override is discarded (`apps/web/src/app/api/pieces/route.ts:101` persists `draft.recommendedFormat`) |
| 3. Pick template | **Gap** — picked once pre-generation (non-binding, `ideate-client.tsx:22-28,158-173`) and again post-generation in review (`piece-review.tsx:417-439`, gated off entirely for reels) |
| 4. Theme input / AI-suggest | Implemented — optional `brief` textarea + pillar filter, `/api/ideas/suggest` |
| 5. AI writes copy/script | Implemented — `llm/provider.ts` `draft()` |
| 6. AI creates assets | Implemented — fal.ai backgrounds/motion (`apps/worker/app/renderer/imagery.py`) + Pillow templates (`apps/worker/app/renderer/vessel.py`) + ffmpeg reel assembly (`apps/worker/app/renderer/reel.py`) |
| 7. Review/approve | Implemented — `piece-review.tsx`, approval happens via "Schedule" |

Text-in-AI-image is already solved, redundantly, at two layers: the LLM's image-prompt
builder (`apps/web/src/lib/imagery/prompt.ts`) appends a guardrail forbidding
text/words/logos, and the worker's fal.ai call (`apps/worker/app/renderer/imagery.py`)
independently appends its own no-text suffix regardless of what the LLM wrote. No
change needed here — noted only to confirm the requirement is already met.

## Design

### 1. Data model & flow changes

- Add a `ReelTemplate` enum alongside the existing `Template` enum (Prisma schema),
  naming a small starter set of script structures: `myth_bust`, `quick_tip`,
  `pov_explainer`, `before_you_ask` (extensible later, not exhaustive now).
- The wizard's step 2/3 selections (`chosenFormat`, `chosenTemplate`) are captured
  before any AI call and threaded through to draft creation as the source of truth.
- `POST /api/pieces` (`apps/web/src/app/api/pieces/route.ts`) stops trusting
  `draft.recommendedFormat`/any LLM-side format opinion for persistence — the
  persisted `format` and `template` come from the wizard's locked-in choice. The
  LLM's `recommendedFormat`/`formatRationale` become informational-only, surfaced as
  a note in review, never authoritative.
- `LlmProvider.draft()` (`apps/web/src/lib/llm/provider.ts`) gains required
  `format` and `template` parameters. `draftPrompt()` (`apps/web/src/lib/llm/prompts.ts`)
  is rewritten to treat them as hard constraints: for reel templates, the prompt
  injects the chosen structure's hook/beat/loop requirements so the generated
  `voiceover` conforms to what was picked.
- The `draftResponseSchema` voiceover field changes from a single narration string to
  a beat-segmented array (`{ beat: string; line: string }[]`) for reel formats, so the
  worker can align captions and cut points to beats.

### 2. Wizard UI

`/ideate` becomes a 4-step sequence on one route, step state carried in the URL query
string (e.g. `?step=template&brandId=...`) so steps are back-button-safe:

1. **Account** — unchanged brand-card picker (`ideate-client.tsx:107-129`).
2. **Style** — new step: four option cards (Carousel / Reel / Single Image / Story)
   replacing the current AI-inferred badge. No AI call yet; advances to step 3.
3. **Template** — options filtered by the style chosen in step 2:
   - Image-based styles → the 5 existing Pillow templates (classic, editorial_bold,
     bold_highlight, minimal_card, photo_overlay), reusing the current pill-picker.
   - Reel → the new script-structure templates, each card showing its hook/beat/loop
     shape so the choice is meaningful.
   - Selection is now binding (`chosenTemplate`), not a soft pre-pick.
4. **Topic** — existing brief textarea + pillar filter, unchanged UI
   (`ideate-client.tsx:131-185`); both the AI-suggest path (blank brief) and the
   generate action now carry `chosenFormat`/`chosenTemplate` forward into
   `/api/ideas/suggest` and `/api/pieces`.

After step 4's generate action, the user lands on the existing `pieces/[id]` review
screen unchanged in structure — only the data flowing into it is now correctly bound.
A lightweight 1-2-3-4 step indicator sits at the top; back navigation preserves
earlier selections.

### 3. Reel template system + algorithm-aware generation constraints

- New static registry, e.g. `apps/web/src/lib/llm/reel-templates.ts`: each entry has
  `id`, `label`, `description` (for the step-3 picker), and a `structure` — hook style
  (e.g. "state a surprising claim/question in one line, deliverable in under 2
  seconds"), ordered beats (e.g. `[hook, myth, correction, takeaway, loop-cta]`),
  target duration range (15–30s), and a `loopHint` (the final beat should echo the
  opening so the edit can loop cleanly).
- `draftPrompt()` renders the chosen structure into the prompt as explicit
  constraints and requests the beat-segmented voiceover described above.
- Health-content guardrails are added to the same prompt pass (not a new gate): no
  before/after framing, no unverifiable outcome claims, favor clearly educational
  phrasing — motivated by the shadow-throttle research finding for this content
  category. The existing deterministic `claims/check.ts` engine remains the hard
  backstop for scheduling; this is additive prompt guidance only.

### 4. AI asset creation (captions, loop) + review/approve

- **Burned-in captions (always-on for reels):** ElevenLabs TTS already returns
  word/character-level timestamps. `apps/worker/app/renderer/reel.py` gains a
  caption-burn step: each beat's line is rendered as on-screen text via ffmpeg
  (`drawtext`/subtitle filter), timed to the actual TTS audio, styled per the chosen
  reel template's caption preset (font/position/animation). This replaces today's
  behavior where the voiceover script is only shown in review, never burned into the
  video. Not a toggle — always on, since it's one of the highest-leverage factors
  from the algorithm research.
- **Loop point:** `reel.py`'s ffmpeg assembly adds a short crossfade/cut from the
  final beat back toward the opening beat's visual/audio texture, using the
  template's `loopHint`. Editing-layer only, no new AI call.
- **Review/approve (`piece-review.tsx`):** minimal changes. The format/template shown
  are the locked-in wizard choices, displayed as read-only badges — changing style or
  template means returning to the wizard (regenerating with a different structure is
  not a small edit), not an inline re-pick mid-review. Existing caption-editing (post
  copy, not burned-in reel captions), claims-check, and schedule flow are unchanged.
  No new distinct "approve" action — "Schedule" remains the approval step, matching
  current behavior.

## Open questions / future work

- Reel template registry is intentionally small (3-4 structures) for this phase;
  expanding the set is future work once we see which structures perform.
- Content-pillar rotation / cadence tracking was explicitly deferred — worth
  revisiting once the wizard is live and generating real posting history.
