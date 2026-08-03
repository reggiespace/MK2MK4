# ReggieSpace — Social Templates Design Brief

> Paste this whole file as the opening prompt of a **new session**. It is the spec for
> designing the real, production social-media templates that the Social Content Studio
> app fills in. Design work only — the surrounding app (Studio/Dashboard/Assets/Pieces/
> Settings) is already built in this project and is being handed to Claude Code.

---

## What a "template" IS here

A template is a **fixed visual surface with labelled holes** — a guideline, not a
generator. Humans *and* the app's AI (fal.ai for images/animation, ElevenLabs for
voice) use it the same way: **fill the holes, don't reinvent the layout.**

Allowed fills only:
- **Text** into named slots (eyebrow, headline, body, stat, source, CTA…), with hard
  character budgets per slot.
- **Images** into named image slots (or a full-bleed background image).
- **Background**: swap a solid/gradient background color, OR drop in a background image
  (only where the template declares an image background).
- **Brand tokens**: primary color, secondary/accent, logo, font pairing.

NOT allowed: moving elements, changing the layout, adding/removing slots, restyling.
The template is the constraint. If a slot is empty it collapses gracefully; it never
invites freeform design.

Every template must therefore ship with a **machine-readable slot manifest** (see
"Deliverable shape") so the AI knows exactly what it may touch and the limits.

## Design bar

- **Client-agnostic.** Gastric IQ is only demo fill. Every color, logo and copy string
  is a prop with a sensible default. A wellness brand, a law firm, and a coffee roaster
  must all look great in the same template by changing tokens only.
- **Built for the scroll.** Thumb-stopping covers, one clear hook, hierarchy that reads
  at feed thumbnail size, generous safe margins for platform chrome (see safe zones).
- **Professional, not templatey.** Real editorial layout craft — confident type scale,
  intentional whitespace, restrained color. No AI-slop gradients, no emoji, no
  rounded-box-with-left-border. Avoid overused fonts (Inter/Roboto/Arial).
- **Legible + accessible.** Body text never below the platform-safe size; maintain
  contrast on every background option and over images (scrims are part of the template).

## Priority & phasing (one style per pass, land each clean before the next)

1. **Carousel — 4:5 (1080×1350).** The workhorse. Do this first and deepest.
   3–4 distinct cover archetypes, each with matching interior slides + CTA end slide:
   - Bold **Knockout** (huge type, dark ground, one word/phrase hook)
   - **Editorial dispatch** (kicker + serif headline + rule, magazine feel)
   - **Big-stat** (dominant number + supporting line + source)
   - **Quote / in-their-words** (pull quote, attribution, mark)
   Interior slide kinds to cover: point/step, stat, list, image+caption, myth-vs-fact,
   CTA. Slide count flexible 3–8.
2. **Reels — 9:16 (1080×1920).** Motion- and voice-ready.
   3–4 cover/hook archetypes + text-overlay frame system. Hook-first title card,
   lower-third caption band, progress ticks, end CTA card. Caption-safe zone that clears
   IG/TikTok UI. Designed so ElevenLabs voice dictates the on-screen text (text = script)
   and fal.ai supplies the background image/animation.
3. **Story — 9:16.** (After Reels; shares the 9:16 system — sticker-safe zones, tap-
   forward hierarchy, link/CTA area.)
4. **Single image — 1:1 (1080) & 4:5.** One-idea posts: stat, quote, myth-vs-fact,
   announcement. 3–4 layouts.
5. **Photo templates.** Lifestyle & Field Note — real image slots, washed treatment,
   logo lockup, text over image with built-in scrim.

## Format & safe zones (bake into every template)

- Carousel/Single 4:5 = 1080×1350; Single 1:1 = 1080×1080.
- Reel/Story 9:16 = 1080×1920. Keep key content within the **caption-safe zone**:
  ~250px top / ~420px bottom clear of platform UI; sides ~64px.
- Consistent inner margin system; a visible "1/N" affordance on multi-slide covers.

## Brand token system (props on every template)

`brandName`, `logo` (image slot), `primary`, `secondary`, `bg` (color OR image),
`fontDisplay`/`fontBody` pairing (offer 2–3 curated pairings), `accent`. Defaults =
the app's Vessel palette (cream #ece6d6 / moss #5c7556 / slate #3b5a78 / brass #b89251,
Spectral + Albert Sans) so they drop into the existing app unchanged.

## Deliverable shape (per template)

- A Design Component (`.dc.html`) with **props** for every fillable slot + brand tokens,
  editable defaults, and graceful empty states. Options-mode gallery: one `<section>`
  per style, archetypes side by side, stable `{turn}{letter}` ids.
- A **slot manifest** per template (JSON): each slot's `id`, `type`
  (text/image/color/logo), `role`, `maxChars` (text), aspect (image), and whether it's
  required — this is the contract the AI fills against.
- A one-line "how AI should treat this" note per template (what it may change, what is
  locked).

## Open questions to confirm at the start of that session

- Font pairings: keep Spectral + Albert Sans as the house pair, or design 2–3 alt
  pairings brands can pick? (Leaning: 2–3 curated pairings.)
- Do covers need an optional logo lockup zone on every archetype, or CTA slide only?
- For Reels, is the on-screen text always the voice script verbatim, or can captions
  differ from narration?

## Context carried over (already decided)

- App is a standalone SaaS ("ReggieSpace Social Studio"), multi-client.
- Publishing via Postiz/Buffer/Zernio; generation via fal.ai; voice via ElevenLabs.
- Vessel palette + Spectral/Albert Sans is the app's own skin (templates default to it
  but must be fully brand-swappable).
- User wants 3–4 archetypes per style, Carousel + Reels first.

## CTA convention (decided — must not be lost)

- **On-slide CTA = engagement only** (save / follow / send). Saves + sends are the
  ranking signals, and feed carousels carry no tappable link, so the end slide never
  spends its slot on "download the app."
- **App-download / external CTA lives at the POST level, not on the surface:** the
  caption ("→ link in bio") and the auto-posted **first comment** (Postiz posts it)
  carry the actual link + pitch. Keeps the promo ask out of the content body (where a
  hard external CTA dampens reach) while still routing intent.
- This is a post-assembly concern the Create page already models (caption + first-comment
  fields exist). Encoded in each template manifest under `postDelivery` so the AI fills
  caption + firstComment with the download CTA and keeps slides engagement-only.
