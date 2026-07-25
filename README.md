# ReggieSpace Social Studio

Create, review and schedule social content from one studio. Next.js web app +
Python media worker, backed by Postgres and Redis, run via Docker Compose.

## How it works

A post is assembled through a six-step wizard — **Account → Style → Template →
Topic → Create → Review**. Five template systems (Carousel, Reel, Story, Single,
Photo) each declare their slides as *kinds* with named, budgeted slots. Those
manifests are the contract everything reads from:

- the AI fills exactly the slots a slide declares, inside their character budgets;
- the editor generates its form from them;
- the renderer draws them.

### One renderer

`components/slide/Slide.tsx` is the only thing that draws a slide. The template
picker's miniatures, the fill preview, the thumbnail strip, the Review cover and
the published PNG all go through it — the worker renders by pointing headless
Chromium at the app's own `/render/slide` route. What you approve in Review is
what publishes. **Do not add a second renderer.**

### Conventions the templates enforce

- **On-slide copy is engagement-only** (save, follow, send). The download link
  lives in the caption and the auto-posted first comment, never on a slide.
- **Accent guardrail** — any brand accent is legible on any ground; the renderer
  substitutes a contrasting sibling where needed, so nothing is hand-tuned.
- **Fit guardrail** — dominant single-word slots shrink rather than overflow.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- A `.env` file at the repo root (see `.env.example`)

## Quick start

```bash
# 1. Copy the env template and fill in your secrets
cp .env.example .env
# at minimum: SESSION_SECRET, OPENAI_API_KEY, WORKER_SHARED_SECRET

# 2. Build and start all services
docker compose -f infra/docker-compose.yml up --build

# 3. Seed the workspace, brand accounts and sign-in user (first run only)
docker compose -f infra/docker-compose.yml exec web \
  node apps/web/node_modules/.bin/tsx apps/web/prisma/seed.ts
```

The web app is then available at **http://localhost:3000**.
The media worker API is at **http://localhost:8000**.

## Services

| Service    | Port | Description                                          |
|------------|------|------------------------------------------------------|
| `web`      | 3000 | Next.js app (auth, UI, AI, publishing)               |
| `worker`   | 8000 | Headless-Chromium slide rendering + ffmpeg reels     |
| `postgres` | 5432 | Primary database (Postgres 17)                       |
| `redis`    | 6379 | Session store / job queue (Redis 7)                  |

## Credentials

Publishing providers (Postiz / Buffer / Zernio) are **bring-your-own**: each
workspace connects its own key in Settings → Integrations, and keys are
encrypted at rest. AI providers (OpenAI / fal.ai / ElevenLabs) run on the
platform's keys from `.env` unless a workspace overrides them.

Before a channel can publish it needs its publisher-side channel id (in Postiz,
the *integration* id) — set in Settings → Channels. The Dashboard greys out any
channel that is still missing one.

## Useful commands

```bash
# Tail logs for a specific service
docker compose -f infra/docker-compose.yml logs -f web
docker compose -f infra/docker-compose.yml logs -f worker

# Stop everything
docker compose -f infra/docker-compose.yml down

# Stop and wipe volumes (resets DB)
docker compose -f infra/docker-compose.yml down -v

# Run DB migrations manually
docker compose -f infra/docker-compose.yml exec web \
  node apps/web/node_modules/.bin/prisma migrate deploy \
  --schema=apps/web/prisma/schema.prisma
```

## Local development (without Docker)

```bash
# Backing services only
docker compose -f infra/docker-compose.yml up -d postgres redis

# Web app
cp .env.example apps/web/.env   # adjust DATABASE_URL / REDIS_URL to localhost
pnpm install
pnpm --filter @giq/web prisma migrate deploy
pnpm --filter @giq/web db:seed
pnpm --filter @giq/web dev

# Worker (separate terminal)
cd apps/worker
pip install -e .
playwright install chromium      # not needed inside Docker
uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
pnpm --filter @giq/web test      # vitest
cd apps/worker && pytest         # worker
```
