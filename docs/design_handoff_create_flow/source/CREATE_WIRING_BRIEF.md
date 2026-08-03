# ReggieSpace — Create Flow Wiring Brief (Session Handoff)

> Paste this as the first message of a **new session**. It covers todos #4 + #10:
> wiring the built templates + Assets library + fal.ai + ElevenLabs into the Create
> (Studio) flow. This is APP wiring, not template design — the five templates and their
> manifests are done and frozen.

---

## Goal

Make the **Create** flow actually assemble a post: pick template → pick topic → fill the
template's slots (from the manifest) using the Assets library, fal.ai (images/animation)
and ElevenLabs (voice) → produce caption + first-comment + hashtags → Review → schedule.

## What already exists (do NOT rebuild)

- **App shell + pages** (all Design Components, Organic/Vessel skin, cross-linked sidebar):
  `Studio.dc.html` (the Create wizard), `Dashboard.dc.html`, `Assets.dc.html`,
  `Pieces.dc.html`, `Settings.dc.html`. Shared runtime `support.js`.
- **Five templates + manifests** (the fill contract — read these, render from them):
  `Template - Carousel.dc.html` / `.manifest.json`, and likewise `Reels`, `Story`,
  `Single`, `Photo`. Each manifest defines: canvas/aspect, safeZone, `aiContract`,
  `brandTokens`, per-archetype/kind slots (with type/role/maxChars/required),
  `postDelivery` (caption + firstComment + hashtags), and `accentGuardrail`.
- **Grounding docs:** `Algorithm Report.dc.html`, `TEMPLATES_BRIEF.md` (has the CTA
  convention + guardrail notes).

## Decided conventions to honor

- **On-slide = engagement only** (save/follow/send). **App-download / external CTA lives
  in `postDelivery`** — the caption ("→ link in bio") and the auto-posted **first comment**
  (Postiz posts it). Never put download CTAs on a slide/frame.
- **Accent guardrail** is built into each template — any brand accent is safe; don't
  hand-tune per slide.
- **Reels/Story text = the voice script** (ElevenLabs). Reels frames carry a `voiceScript`
  per frame; Story frames each carry one interactive sticker.

## The wiring work (todos #4 + #10)

1. **Render a template from its manifest inside Create.** After template + topic are
   chosen, show the real template DC (via `dc-import`/`x-import`) with the topic's copy
   flowed into its slots. Slot list + limits come from the manifest.
2. **Fill step driven by slot manifest.** For each `text` slot: an editable field with the
   maxChars budget. For each `image` slot: pick from the **Assets library** OR generate
   with **fal.ai** (prompt field = `imagePrompt`). Logo auto-places from the brand default
   (Assets → logo). Photo/Lifestyle + logo placement pull from the library.
3. **fal.ai integration points.** Image slots: generate/animate from a prompt. Show a
   generating state; store results back into Assets so they're reusable.
4. **ElevenLabs integration.** For Reel/Story templates, a **voice picker** (voiceId) +
   verbatim/condensed toggle; on-screen text = narration. Preview the read.
5. **postDelivery assembly.** Auto-draft caption + first-comment (download CTA here) +
   hashtags; all editable; flow to the Review preview + schedule (already stubbed).
6. **Assets → fill wiring (todo #4).** Assets library items (Logos/Screenshots/Photos)
   are selectable in the image-slot fill; logo becomes brand default auto-placed on
   cover/CTA slides.

## Settings dependencies (already have API-key fields — confirm coverage)

Postiz/Buffer/Zernio (publish), **fal.ai** (images/animation), **ElevenLabs** (voice).
Verify Settings has key fields for all five; add fal.ai/ElevenLabs if missing.

## Open questions to confirm at the top of that session

- Is this wiring meant to run live (real fal.ai/ElevenLabs calls) or be a high-fidelity
  prototype with mocked generation? (Prototype likely, since final build goes to Claude Code.)
- Does the fill step edit slots inline on the live template preview, or in a side panel
  with the preview updating? (Lean: side panel + live preview.)
- Should generated images auto-save to Assets, or only on explicit "save to library"?

## Deferred (NOT this session)

- Template brand-token expansion (font pairings, secondary color, logo prop into slots) —
  todo #9, its own template session.
