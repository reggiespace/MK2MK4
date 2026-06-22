# Learning Loop — Performance Feedback → Research Brain

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Author:** Reginaldo Santos (with Claude)

## Goal

Close the autopilot's open loop. Today the daily-run cron generates and publishes
content fire-and-forget; nothing observes how posts perform, and the research seam
(`getResearch`) is a hardcoded `{ summary: null }` stub. This spec ingests real
post-level performance from the schedulers we already publish through (Buffer,
Zernio), aggregates it deterministically, and feeds the result back into the writer
so the autopilot improves over time.

This delivers two outcomes at once:
- **Content quality** — ideas/writer get grounded in what actually worked.
- **Feedback loop** — performance data flows back into generation.

## Approach

**Heuristic loop, B-ready.** Aggregation is deterministic and unit-testable (same
ethos as the claims-check engine), not an LLM analyst. At current volume (~1–2
posts/day) a digest we can trust and debug beats an LLM pattern-matching on noise.
The metrics table is structured so a future LLM-analyst step (Approach B) can consume
the same data without rework. A full experimentation/A-B framework (Approach C) is
explicitly out of scope until volume justifies statistical significance.

## Architecture

Three stages: **ingest metrics → aggregate into insights → `getResearch` returns the
digest.** Downstream is already wired — the writer prompt and `Idea.insightsContext`
both consume `research.summary`, so no plumbing changes are needed past `getResearch`.

### 1. Data model — `PostMetrics`

```prisma
model PostMetrics {
  id              String        @id @default(cuid())
  scheduledPostId String
  scheduledPost   ScheduledPost @relation(fields: [scheduledPostId], references: [id], onDelete: Cascade)
  fetchedAt       DateTime      @default(now())
  impressions     Int?
  reach           Int?
  likes           Int?
  comments        Int?
  shares          Int?
  saves           Int?
  clicks          Int?
  engagementRate  Float?        // (likes + comments + shares + saves) / reach, when reach present
  raw             Json          // provider payload, for auditing / future fields

  @@index([scheduledPostId, fetchedAt])
}
```

- **One row per fetch**, not per post — keeps a time series so we can watch a post
  mature and compute trend deltas.
- `ScheduledPost` gains a `metrics PostMetrics[]` back-relation.
- `ScheduledPost.providerPostId` (already persisted) is the key used to fetch.

### 2. Publisher interface — `fetchMetrics`

Add one method to the `Publisher` interface (`apps/web/src/lib/publishers/types.ts`):

```ts
fetchMetrics(providerPostId: string, network: string): Promise<PostMetricsInput | null>
```

- `PostMetricsInput` is the normalized shape (the metric fields above, minus
  bookkeeping columns).
- Returns `null` when metrics are not yet available (post too fresh / provider lag);
  the caller retries on the next cycle.
- Implemented in `buffer.ts` (GraphQL metrics query) and `zernio.ts` (REST analytics
  endpoint). Each adapter maps its provider's payload into `PostMetricsInput`.

### 3. Ingestion job — `apps/web/src/lib/pipeline/ingest-metrics.ts`

- Selects `ScheduledPost`s where `status = published`, `providerPostId != null`, and
  whose most recent `PostMetrics.fetchedAt` is older than a **backoff window**.
- Backoff schedule: re-fetch at roughly day 1, 3, 7, 14 after publish, then stop.
  Engagement plateaus after ~1–2 weeks; no indefinite polling.
- For each, calls `publisher.fetchMetrics`, upserts a `PostMetrics` row, computes
  `engagementRate` when `reach` is present.
- Per-post failures are logged and swallowed — one bad post never aborts the batch.

### 4. Cron entrypoint — `/api/cron/ingest-metrics`

- New secret-guarded route mirroring `/api/cron/daily-run`.
- Run by the same docker sidecar, on its own daily schedule.
- Separate from `daily-run` deliberately: ingestion reads older posts, generation
  writes today's — different cadence and failure isolation.
- Returns 200 with `{ fetched, skipped, errored }` even on partial failure.

### 5. Aggregation — `apps/web/src/lib/pipeline/insights.ts`

Pure deterministic function, Prisma read only, unit-testable:

```ts
buildInsights(brandId, asOf): Promise<BrandInsights>
```

- Reads the latest `PostMetrics` per `ScheduledPost` for a brand over a trailing
  window (default 30 days).
- Joins `ScheduledPost → ContentPiece → Idea` to recover **pillar** and **format**.
- Computes: engagement rate by pillar (ranked), by format (carousel/single/reel),
  best vs. worst performers, and an up/down trend flag vs. the prior window.
- **Minimum-sample guard:** a segment may not claim "outperforming" until `n ≥ 3`
  posts — protects against noise at low volume.
- Output is a **structured `BrandInsights` object**, not prose.

A separate `renderInsightsSummary(insights): string | null` formatter turns the
object into the text digest the writer consumes. Returns `null` below the sample
threshold (cold start behaves exactly like today).

### 6. Wire `getResearch`

```ts
export async function getResearch(brandId, date) {
  const insights = await buildInsights(brandId, date);
  return { summary: renderInsightsSummary(insights) }; // null until enough data
}
```

No downstream changes — `run.ts` already passes `research.summary` to the writer and
persists it as `Idea.insightsContext`.

### 7. Operator visibility — `/insights` page

New page alongside `/queue`, `/ideate`, `/pieces`:
- Per brand: pillar/format leaderboard.
- The exact digest string currently being fed to the writer (makes the autopilot's
  leanings legible — you can see *why* it favors a direction).
- Sortable table of recent posts with their metrics.

## Error handling

- `fetchMetrics` failures are per-post, logged not thrown.
- Partial provider payloads: store present fields, leave the rest null;
  `engagementRate` only computes when `reach` is present.
- Cron route returns 200 with a result summary on partial failure (matches
  `daily-run`'s contract).
- `buildInsights` / `renderInsightsSummary` return empty/`null` on no data — never
  throws into the generation path.

## Testing

- `insights.test.ts` — aggregation math, ranking, `n ≥ 3` guard, empty/cold-start → `null`.
- `ingest-metrics.test.ts` — backoff-window selection, upsert, partial-field handling,
  mocked publishers (same pattern as `run.test.ts`).
- Publisher adapter tests — provider payload → normalized `PostMetricsInput` mapping
  for both Buffer and Zernio.

## Out of scope

- LLM-analyst summary (Approach B) — data model is built to allow it later.
- A/B experimentation framework (Approach C).
- Meta Graph direct insights — Buffer/Zernio analytics only for now.
- AI per-slide imagery (separate spec, 2026-06-16).

## Migration / rollout

- Single additive Prisma migration (`PostMetrics` + back-relation). No changes to
  existing rows.
- New cron sidecar schedule entry for `/api/cron/ingest-metrics`.
- Cold start: until ~3 posts have metrics per segment, `getResearch` returns `null`
  and the pipeline behaves exactly as today — zero-risk incremental rollout.
