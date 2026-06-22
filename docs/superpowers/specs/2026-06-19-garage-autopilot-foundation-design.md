# Foundation: Garage S3 + Daily Auto-Draft Pipeline — Design

**Date:** 2026-06-19
**Branch:** `feat/garage-autopilot`
**Status:** Approved design — ready for implementation planning

## Context

MK2MK4 ("Gastric IQ Social Content Studio") already implements most of the
`CLAUDE_CODE_BRIEF.md` vision through milestones M1–M8: a pnpm monorepo with a
Next.js web app (`apps/web`) and a Python FastAPI media worker (`apps/worker`),
Postgres via Prisma 7, iron-session single-operator auth, OpenAI content
generation, a deterministic claims-check gate, Pillow/ffmpeg renderers,
ElevenLabs TTS, and Buffer + Zernio publisher adapters.

This slice closes the gap between "mostly built" and "runs my posts daily,
unattended, end to end" by adding the two missing foundations:

1. **Public media hosting** — providers (IG/FB/TikTok) fetch media by public
   URL, so media must live on a publicly-readable S3-compatible store. The
   current local-volume-behind-auth storage cannot publish for real.
2. **A daily auto-draft pipeline** — a scheduled orchestration that runs
   research → ideate → generate → render → host → claims-check and lands
   review-ready drafts each day, so the operator only has to inspect and approve.

### Decisions locked during brainstorming

- **Approach:** Extend the existing MK2MK4 stack (Next.js + Python worker). Do
  not rebuild to the brief's fresh-TS architecture.
- **Publish model:** Keep the human review/approve gate. The autonomy target is
  "auto-generate everything into a review queue daily; operator approves in one
  pass; then auto-schedule/publish." The "almost" in almost-fully-autonomous is
  that one approval click.
- **Media storage:** Garage S3 (the box from the Cowork experiment), path-style,
  public-read prefix per market.
- **LLM:** Keep OpenAI (operator's existing key); provider stays behind the
  existing adapter interface.
- **Promotion** (for later slices) means first-comment + cross-posting only — no
  paid ads, no engagement bots.
- **Deploy target:** dokploy, single box, self-contained in docker-compose.

### Explicitly out of scope (each its own later spec)

- Renderer upgrade — porting Cowork's audio-fit retiming and semantic scene
  grammar (`hook/point/statement/list/gauge/cta`). MK2MK4's renderer already has
  AI backgrounds, motion clips, and overlays; what Cowork does better is
  voice/visual sync and scene variety. Worthwhile, but separate.
- Full research/competitor brain and analytics ingestion.
- Paid promotion / boosting.

## Architecture

```
                         cron sidecar (daily)
                                │ POST /api/cron/daily-run  (shared secret)
                                ▼
  ┌────────────────────────── apps/web (Next.js) ──────────────────────────┐
  │  cron route → orchestrator:                                             │
  │    cadence pick → getLocalContext (research seam) → ideate → generate   │
  │    → enqueue render → claims-check → land in review queue               │
  │  review UI: inspect / approve / edit+re-lint / discard                  │
  └───────┬─────────────────────────────────────────────────┬──────────────┘
          │ render job (HTTP)                                 │ schedule (on approve)
          ▼                                                   ▼
   apps/worker (FastAPI)                              Buffer / Zernio adapters
     render (Pillow/ffmpeg/TTS)                         (existing)
        │ upload                                       respects Buffer ≤10 cap
        ▼
   Garage S3 (public-read) ── public URL ──▶ verified 200 before "hosted"
          │ callback
          ▼
   apps/web worker-callback route → MediaAsset.publicUrl
```

## Components

### 1. Garage S3 public media storage (`apps/worker`)

Replace the local-volume implementation in `apps/worker/app/storage.py`
(`save_asset(relative_path, data) -> url`) with an S3-compatible client (boto3)
pointed at Garage. The function signature is the seam and stays the same, so
callers (render jobs, callback) are unaffected.

- S3 client config: `endpoint_url` set, `region_name="garage"`,
  `config=Config(s3={"addressing_style": "path"})` (path-style / force-path).
- Key layout: `<market_prefix>/<piece_id>/<filename>` where market prefix is
  `br/` or `us/` derived from the brand locale/key.
- Object written with public-read (bucket policy or per-object ACL, whichever
  Garage honors — verified at deploy).
- Public URL: `MEDIA_PUBLIC_BASE_URL` if set (CDN), else
  `<endpoint>/<bucket>/<key>`.
- **Verify step:** after PUT, issue an HTTP GET to the public URL; require
  `200` and a content-type matching the asset kind (`video/mp4`, `image/jpeg`,
  `image/png`). On failure, the host step fails loudly (the asset never reaches
  a publishable state) rather than failing silently at publish time.
- Config via env (dokploy secrets): `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`,
  `MEDIA_S3_ENDPOINT`, `MEDIA_PUBLIC_BASE_URL` (optional),
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (Garage key/secret, least
  privilege: write to media prefixes only).
- The web `/media/[...path]` route remains as a **local-dev fallback**,
  selected by a storage-backend env flag, and is off in production.

### 2. Daily auto-draft pipeline (`apps/web`)

`POST /api/cron/daily-run` — guarded by a shared secret header
(`x-cron-secret`), also invokable manually from the UI. For each active brand
(us, br) it runs the orchestrator:

1. **Cadence** — pick today's pillar + format from a per-brand weekly cadence
   (seeded `Cadence` config). Brief §13 cadences:
   - BR: IG 3–4×/wk, FB 2–3×/wk.
   - US: IG 4×/wk, FB 3×/wk, TikTok 2×/wk.
   - Reels → IG (+ TikTok where the channel exists); carousels/single → IG + FB.
2. **Context (research seam)** — `getResearch(brand, date)` returns a research
   analysis: event hints (local feriados/sports/events) plus, later, competitor
   and own-analytics signals. **Minimal stub in this slice** (returns an empty or
   trivially-derived analysis); the full research/competitor/analytics brain
   plugs in here later. Result is written to `Idea.insightsContext`.
3. **Story brief (writer seam)** — `composeStory({ research, pillar, brand })`
   receives the research analysis and today's pillar and writes *the story we
   want to tell* in this post: a short narrative brief (angle, key message,
   beats, CTA intent) that the generator then renders into concrete copy and
   slides. This is a distinct, named step — not folded into generation — so the
   "writer" can grow independently of the renderer/caption logic. **Implemented
   minimally now** (an OpenAI call that turns research+pillar into a structured
   brief), stored on the `Idea` (`angle` + a new `storyBrief Json?`). The full
   researcher feeds this step without changing its interface.
4. **Generate piece** — reuse the pieces-create logic, now driven by the story
   brief: caption + first comment + slides (carousel/single) or reel spec
   (scenes + voiceover), localized per brand locale, via OpenAI. All generator
   output still passes the claims gate.
5. **Render** — enqueue via the existing render route; worker renders → uploads
   to Garage → callbacks with the public URL.
6. **Claims-check** — run the existing deterministic gate (plus the optional LLM
   judge if configured). Pass → piece becomes `review`; fail → `blocked` with
   reasons stored.

The pipeline is therefore **research → writer → generate → render → host →
lint**, with research and writer as explicit, independently-evolvable steps.

**Idempotency:** dedupe by `(brandId, runDate, pillar)`. A `ContentRun` row
groups a day's drafts, holds the dedupe key, and records per-step status for
observability. Re-running `daily-run` on the same day is a no-op for already-run
(brand, date, pillar) combinations.

### 3. Review / inspect / approve UI (`apps/web`)

Extend the existing pieces review UI into a **daily queue**:

- Today's drafts grouped by brand, with status chips: `review`, `blocked`,
  `scheduled`, `published`, `failed`.
- Per piece: media preview (Garage URL), caption, first comment, and a **claims
  panel** (rule results + any LLM-judge verdict).
- Actions: **Approve** → existing schedule route (which respects Buffer's ≤10
  scheduled-org-wide cap); **Edit + re-lint**; **Discard**.
- Blocked items surface their failure reasons for fix-and-recheck.

This is the operator's inspect+approve surface. The "suggest content"
affordance is deferred to the researcher slice.

### 4. Dokploy deployment (`infra`)

A self-contained **cron sidecar** added to `infra/docker-compose.yml`: a minimal
container (alpine + crond, or `ofelia`) that `curl`s `/api/cron/daily-run` with
the shared secret once per day, timed to each market's local morning. Shipping
the schedule in the compose file keeps it portable and independent of the
dokploy UI scheduler.

## Data model changes (Prisma)

Minimal, additive:

- **`ContentRun`** — `{ id, brandId, runDate (date), pillar, format, status,
  error?, createdAt }` with `@@unique([brandId, runDate, pillar])`.
  `ContentPiece` gains an optional `runId` → `ContentRun`.
- **`PieceStatus`** — add `blocked` (claims-fail, terminal until edited).
- **`ContentPiece`** — add a `claims Json?` field to persist the gate result for
  the review panel.
- **`Cadence`** — seeded config: `{ id, brandId, weekday (0–6), pillar, format,
  network[] }`, so cadence is tunable without code changes.
- **`Idea.storyBrief Json?`** — the writer step's structured narrative brief
  (angle, key message, beats, CTA intent), persisted so the review UI can show
  the story behind a piece and the writer can be re-run independently.

Seed updates: per-brand cadence rows reflecting the brief §13 cadences.

## Future-proofing seams (not built in this slice)

These are explicitly designed-for but deferred; the work below must not paint
them into a corner.

- **Research / competitor brain + analytics ingestion** — plugs into
  `getResearch(brand, date)` (step 2) without changing its callers. It enriches
  the analysis written to `Idea.insightsContext`, which the writer already
  consumes. No interface change required when it lands.
- **Channel dashboard** — a read-only view of per-channel KPIs (posts,
  followers, likes, comments, reach). Both publisher adapters' providers expose
  analytics (Buffer + Zernio MCP analytics tools); the dashboard is a new
  read-side surface that does not touch the pipeline. Leave the publisher
  adapter interface able to grow a `getChannelStats()` method later.
- **Writer step depth** — `composeStory` is built minimally now but is its own
  named step (above), so it can later incorporate richer research, A/B angle
  selection, or a multi-pass outline→draft flow without disturbing generation.

## Error handling

- **Host step:** non-200 / wrong content-type on the public-URL verify, or a
  failed media probe (missing stream, zero duration, blank/too-small image,
  silent audio where a voiceover was requested) → asset/piece marked `failed`
  with the reason; never advances to publishable.
- **Orchestrator step failures:** recorded on the `ContentRun` (per-step status
  + error); a failed step does not abort other brands/pillars in the same run.
- **Claims fail:** `blocked` + reasons; never schedules.
- **Cron auth:** missing/invalid `x-cron-secret` → 401.
- **Idempotency:** `(brandId, runDate, pillar)` unique constraint prevents
  duplicate drafts on re-run.

## Testing

- **Unit:** S3 path-style URL builder; public-URL 200/content-type verify;
  cadence picker (weekday → pillar/format/networks); `(brand,date,pillar)`
  dedupe key; existing claims-gate tests stay green.
- **Integration (Testcontainers):** upload + verify against a MinIO/Garage
  stand-in; a full `daily-run` with a mock LLM provider and a mock worker that
  produces a `review` draft into the queue; a deliberately non-compliant caption
  landing `blocked` and never scheduling.
- **Content integrity:** unit tests for caption/first-comment length limits and
  on-slide text-fit (overflow → wrap or flag, never crop).
- **Media quality:** worker-side checks that a rendered reel has both video and
  audio streams at 1080×1920 with non-zero duration, a requested voiceover
  yields non-silent audio, and images are non-blank at target dimensions; the
  host verify rejects empty/broken assets.

## Acceptance criteria (this slice)

1. The worker uploads rendered media to Garage; its public URL returns 200 with
   the correct content-type, verified before the asset is marked hosted.
2. `POST /api/cron/daily-run` produces, per active brand, a review-ready draft
   (caption + first comment + hosted media) grouped under a `ContentRun`, and is
   idempotent on same-day re-run.
3. A deliberately non-compliant caption is `blocked` and never schedules.
4. The daily queue UI shows the day's drafts with status, media preview, caption,
   first comment, and claims results; Approve schedules via the existing route
   (respecting the Buffer ≤10 cap); Edit+re-lint and Discard work.
5. A cron sidecar in docker-compose triggers `daily-run` on schedule on dokploy.
6. **Content integrity** — generated copy is complete, never truncated: captions,
   first comments, and on-slide text fit their fields/frames with no clipped or
   cut-off characters, and caption length stays within each platform's limit.
   On-slide text that would overflow is wrapped or the piece is flagged, never
   silently cropped.
7. **Media quality** — every produced asset is renderable and professional:
   images are non-blank at target resolution; reels carry both a video and an
   audio stream at 1080×1920 with audible voiceover and visible (uncut) text;
   audio is present and non-silent where a voiceover was requested. The host
   step's verify probes the asset (e.g. `ffprobe` for streams/duration, size/
   dimension checks for images) and fails the piece rather than hosting a
   broken or empty asset.

## Rollout / git

- Done: committed `feat/ai-imagery-ux` work, created `main` at that point,
  branched `feat/garage-autopilot` for this slice.
- Secrets (Garage key/secret, cron secret) supplied via dokploy env; never
  committed. `.env.example` updated with the new `MEDIA_S3_*` and `CRON_SECRET`
  keys.
