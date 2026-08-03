# Handoff: ReggieSpace — Create Flow (Studio wizard, templates, Assets/Settings wiring)

## Overview
"Create" is a six-step wizard (Account → Style → Template → Topic → Generate/Fill → Review) that assembles one Instagram/Facebook post for the **Gastric IQ** / **Gastric IQ Brasil** brand accounts: pick a template archetype from a manifest, have AI draft copy into its slots, fill image slots from an Assets library or generate with fal.ai, add an ElevenLabs voice track for Reels/Stories, assemble caption/first-comment/hashtags, then review and schedule via Postiz.

## About the Design Files
The files in `source/` are **design references built as HTML/JS prototypes** (Anthropic "Design Component" format — plain classes with a `renderVals()` returning template values; not a framework you should adopt). They show intended look, content, and interaction — **they are not production code to copy in directly**. The task is to **recreate this UI and flow in the target codebase's real stack** (React/Vue/native/etc., using its existing component library, state management, and API layer), wiring the mocked steps below to real fal.ai, ElevenLabs, and Postiz calls. If no frontend stack exists yet, choose the framework best suited to the target app and implement there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and all interaction states are final-intent. Recreate pixel-for-pixel where feasible; the generation/AI steps are **mocked with setTimeout and canned copy** — those are the integration points to make real (see "Integration points" below).

## Screens / Views

### 1. Studio.dc.html — the Create wizard (the main deliverable)
A single page, 236px fixed sidebar (nav + account switcher) + a scrolling main column (max-width 1140px, 40px side padding). The wizard body is a `--surface-2` (#faf7ec) card, 20px radius, 28px/30px padding, holding a step indicator row and the active step's content, with a sticky footer (Back / step label / Continue).

**Step indicator**: 6 numbered pill steps ("Account", "Style", "Template", "Topic", "Create", "Review") joined by 1.5px connector lines. Current step: filled `--accent` (#5c7556) circle. Completed: `--moss` (#5c7556) circle + check icon, connector turns moss. Steps are clickable once reached (`maxStep` gates it — no skipping ahead).

**Step 1 — Account** (`isAccount`): two account cards (Gastric IQ EN / Gastric IQ Brasil PT-BR) each with a gradient monogram mark, name, locale, channel count; selected card gets a 2px accent border + check badge. Below, a "Channels · {account}" panel lists Instagram/Facebook as always-on toggle chips (icon, name, @handle, tick), plus "+ Connect channel" which expands a row of the remaining platforms (TikTok, YouTube, LinkedIn, X) to add.

**Step 2 — Style** (`isStyle`): a responsive grid (`minmax(184px,1fr)`) of 5 style cards — Carousel (4:5, 3–8 slides), Reel (9:16, 15–30s), Story (9:16, 1–5 frames), Single image (4:5, 1 image), Photo (4:5, washed lifestyle). Each card: icon tile (aspect-ratio matches the format), name, description, meta line in mono/brass, selected state = 2px accent border + green check.

**Step 3 — Template** (`isTemplate`): reads the chosen style's **manifest** (see Design Tokens → Manifest below) and renders one card per **cover archetype** (e.g. Carousel: Knockout / Editorial dispatch / Big-stat / Quote). Each card shows a **live miniature render of that exact layout** (built from the same `renderSlide()` function used everywhere else — not a static screenshot), plus name, role, description. This is the most important fidelity point: the template step is not a generic icon grid, it's real preview art.

**Step 4 — Topic** (`isTopic`, max-width 640px): content-pillar chips (locale-specific — 5 pillars, EN or PT-BR depending on account), a free-text theme textarea, an "AI suggest topics" button that (after a mocked 900ms "thinking" state) reveals 3 topic-idea cards (title, one-line angle, format tag). Clicking a pillar or an idea sets the topic text.

**Step 5 — Generate → Fill** (`isGenerate`), three phases:
- **Idle**: a summary table (Account/Style/Template/Topic/Channels) + "Generate draft" button.
- **Working**: ~2.2s "Writing your copy…" (shimmering skeleton lines) → ~2.4s "Composing slides…" (shimmering image-frame placeholders) — purely cosmetic pacing.
- **Done — the Fill workspace** (the core screen): two-column layout, `minmax(0,1fr)` live preview + fixed 360px editor.
  - **Left**: the active slide/frame rendered at real fidelity inside a soft inset panel (scales via an SVG `viewBox` wrapper so it always fits its column — see Engineering notes). Below it, for multi-slide formats (carousel/reel/story), a horizontal thumbnail strip (click to select, an "Add" button opens a menu of the manifest's interior kinds to insert, and — when a non-cover/non-locked slide is active — move-left/move-right/delete controls).
  - **Right**: a 3-tab editor — **Slots** (manifest-driven form: text inputs and textareas with live `n/max` character counters colored red past budget; image slots show a thumbnail + "Library" and "Generate" buttons; list/pair/quiz slots render repeatable rows with add/remove and, for quizzes, a "mark correct" toggle; the cover slide additionally shows a layout-swap chip row to switch archetype without losing other slides), **Voice** (Reels/Stories only — ElevenLabs voice picker with 3 named voices, Verbatim/Condensed segmented toggle, a "preview the read" play button with an animated waveform and assembled script list), and **Post/Sticker** (caption + first-comment + hashtag chips with add/remove, for Stories replaced by link-sticker URL + mention field).

**Step 6 — Review** (`isReview`): a mock Instagram post card (header with account mark/handle/"Sponsored", the real filled cover art, like/comment/send/save icon row, like count, caption + hashtags + first-comment preview) beside a publish panel: "Cleared to publish" badge, channel chips, Best-time vs Custom-time radio cards, Approve & Schedule / Publish now buttons. After scheduling, an inline confirmation state with "Create another".

### 2. Template - *.dc.html + *.manifest.json (Carousel/Reels/Story/Single/Photo)
Five frozen archetype-gallery pages — **not to be rebuilt**, but essential reference: each is the single source of truth for that format's visual system (grounds, type scale, safe zones, accent guardrail) and its manifest is the literal slot contract Studio reads (`aiContract`, `brandTokens`, per-kind `slots[]` with `type/role/maxChars/required`, `postDelivery`, `accentGuardrail`). See `TEMPLATES_BRIEF.md` for the CTA convention (on-slide = engagement only; download CTA lives in caption/first-comment, never on a frame).

### 3. Assets.dc.html / Settings.dc.html / Dashboard.dc.html / Pieces.dc.html / Algorithm Report.dc.html
Surrounding app shell pages, included for navigation/visual-language reference. Settings already has key fields for fal.ai, ElevenLabs, and Postiz/Buffer/Zernio — recreate those forms as real credential storage.

## Integration points (what's mocked → what to make real)
1. **Copy generation** (`Component.generate()` in Studio): currently a fixed timeout sequence filling a hard-coded bilingual content pack (`this.C.en` / `this.C.pt`). Replace with a real LLM call using the account's brand voice + the manifest's `aiContract` + the user's topic/pillar, returning per-slot copy honoring each slot's `maxChars`.
2. **Image slots** (`openPicker`/`genImage`): "Library" opens a modal reading a hard-coded `ASSETS` map per account; wire to the real Assets library/API. "Generate" is a 1.6s mocked fal.ai call that fabricates a tinted placeholder and (per product decision) **auto-saves the result into Assets** — keep that auto-save behavior, but call the real fal.ai image/animation endpoint with the slot's `imagePrompt`/prompt text and store the returned asset.
3. **Voice** (`previewRead`): mocked play/pause + fabricated waveform/duration. Replace with a real ElevenLabs TTS call using `voiceId` + the assembled (verbatim or condensed) script, and play the returned audio.
4. **postDelivery**: caption/first-comment/hashtags are seeded from the content pack; keep them user-editable but have generation populate them from the AI draft, honoring the "download CTA lives in caption + first comment, never on a slide" rule.
5. **Publish** (`onSchedule`): sets local `scheduled` state only. Wire to Postiz's schedule/publish API using the selected channels and time.
6. **fal.ai/ElevenLabs credentials**: read from Settings' existing key fields (already present — verify field names match your API client).

## State Management
Studio holds one component-local state object (see file for exact shape): wizard `step`/`maxStep`, selected `accountId` + per-account `channels`/`extra` platforms, `style`/`arch`, `topic`/`pillar`/`ideas`, `genPhase` (`idle→writing→assets→done`), a `doc` object (`{slides:[{kind,f:{...slotValues}}], caption, first, hashtags, linkSticker, mention}`) that all editing mutates, `activeSlide`/`editorTab`, image-picker state, voice/narration state, and review state (`when`, `scheduled`). Recreate this as normal component/store state in the target framework; the `doc` shape is a good candidate for your real post-draft schema.

## Design Tokens
- **Colors**: `--bg` #ece6d6, `--surface` #f4efe0, `--surface-2` #faf7ec, `--ink` #1a2230, `--moss` #5c7556 (accent/success), `--moss-d` #4c6247, `--slate` #3b5a78 (secondary/links), `--brass` #b89251 (kicker/mono accent), `--muted` #6e6952, `--border` #d9d1b6, `--border-2` #cabf9d. Slide grounds: dark `radial-gradient(120% 90% at 50% 0%, #20293a, #141a24 62%)` on `#f4efe0` text; primary `#3b5a78`; secondary `#5c7556`; photo `linear-gradient(150deg,#6b5f43,#2a2a20)`.
- **Type**: Spectral (display/serif headings, weights 500–800, some italic), Albert Sans (UI/body, 400–800), IBM Plex Mono (kickers/labels/counters, uppercase, 0.14em tracking).
- **Radii**: 20px cards, 16px panels, 12px inputs/buttons, 999px pills/chips.
- **Manifest** (the slot contract — see the 5 `*.manifest.json` files): each template declares `canvas` (width/height/aspect), `kinds{}` keyed by an id like `1a-knockout` with `role` (cover/interior/end/frame), `ground`, `name`, `desc`, and `slots[]` (`id, type: text|area|image|pair|list|quiz, max, required, label`), plus which kind-ids serve as `cover`/`interior`/`end` for that format.

## Assets
No external image/icon assets — icons are inline SVG (Lucide-style paths embedded in the logic class), image slots are placeholder tints (real photos/screens come from the Assets library or fal.ai in production).

## Engineering notes worth preserving
- The live slide/frame preview is rendered by one shared `renderSlide(slideData, index, total, ctx)` function per template, used identically in the Template-picker miniatures, the Fill workspace's main preview + thumbnail strip, and the Review cover — **one renderer, many sizes**, so what you approve in Review is pixel-identical to what you filled. Recreate this as one component parameterized by scale, not several near-duplicates.
- That renderer is scaled responsively via an SVG `<svg viewBox="0 0 W H"><foreignObject>…</foreignObject></svg>` wrapper rather than JS-measured `transform: scale()` — this keeps it correct at any container width without a ResizeObserver. Worth keeping this pattern (or your framework's equivalent) so the preview never clips.
- A small contrast-guard helper (`safeOn(accentColor, backgroundColor, minRatio)`) swaps the accent for a fallback brass/cream tone on grounds where the raw accent would fail contrast (e.g. big stat numbers on the primary/secondary slate-green grounds). Keep this guardrail — it's what the design brief calls the "accent guardrail."

## Files
See `source/` in this handoff for the full HTML/JSON. Studio.dc.html is the primary deliverable; the five Template - *.dc.html/.manifest.json pairs are the frozen design system it reads from.
