# Gastric IQ Social Content Studio

Full-stack social content studio. Next.js web app + Python media worker, backed by Postgres and Redis, run via Docker Compose.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- A `.env` file at the repo root (see below)

## Quick start

```bash
# 1. Copy the env template and fill in your secrets
cp .env.example .env
# edit .env — at minimum set SESSION_SECRET and OPENAI_API_KEY

# 2. Build and start all services
docker compose -f infra/docker-compose.yml up --build

# 3. Create the operator account (first run only)
docker compose -f infra/docker-compose.yml exec web \
  node apps/web/node_modules/.bin/tsx apps/web/scripts/create-operator.ts
```

The web app is then available at **http://localhost:3000**.  
The media worker API is at **http://localhost:8000**.

> On subsequent starts you can skip `--build` unless you've changed code:
> ```bash
> docker compose -f infra/docker-compose.yml up
> ```

## Services

| Service    | Port | Description                              |
|------------|------|------------------------------------------|
| `web`      | 3000 | Next.js app (auth, UI, API routes)       |
| `worker`   | 8000 | Python/FastAPI media renderer            |
| `postgres` | 5432 | Primary database (Postgres 17)           |
| `redis`    | 6379 | Session store / job queue (Redis 7)      |

## Environment variables

Copy `.env.example` to `.env` and set the values you need. Required for basic operation:

| Variable           | Description                                      |
|--------------------|--------------------------------------------------|
| `SESSION_SECRET`   | Random string ≥ 32 chars for cookie signing      |
| `OPENAI_API_KEY`   | GPT-4o for content generation                    |
| `WORKER_SHARED_SECRET` | Shared secret between web ↔ worker          |

Optional (media generation and publishing):

- `FAL_KEY` — image generation via fal.ai
- `ELEVENLABS_API_KEY` + voice IDs — voiceover synthesis
- `BUFFER_API_KEY` / `BUFFER_ORG_ID` — Buffer publishing
- `ZERNIO_API_KEY` / `ZERNIO_BASE_URL` — Zernio social publishing

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

Start only the backing services, then run the apps natively:

```bash
# Backing services only
docker compose -f infra/docker-compose.yml up -d postgres redis

# Web app
cp .env.example apps/web/.env   # adjust DATABASE_URL / REDIS_URL to localhost
pnpm install
pnpm --filter @giq/web dev

# Worker (separate terminal)
cd apps/worker
pip install -e .
uvicorn app.main:app --reload --port 8000
```
