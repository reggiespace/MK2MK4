# Studio Agent MCP Surface — Design

**Date:** 2026-08-02
**Status:** Approved, pending implementation plan

## Why

The Studio can only be driven by a human at a keyboard. Every capability lives behind a
server action that reads an iron-session cookie (`app/actions/create.ts` →
`ownedAccount()` → `requireAuth()`), and the only HTTP route is the worker callback. An
external agent has nothing to call.

The goal is a morning cron: Hermes (at `hermes.reggiespace.ca`) or Claude wakes up, is
told which brand account to write for, researches what is culturally live for that
account's locale right now, and leaves a finished, image-filled, narrated, rendered
draft waiting for review. The operator approves and publishes.

Cultural adaptation is the point, not translation. Today `generateDraft` accepts exactly
`topic` and `pillar` (`lib/ai/generate.ts`), and locale only ever becomes "write in
pt-BR." Nothing can carry *"Festa Junina is three weeks out and it is a food-heavy
season"* into generation. The agent is where that research capability already exists —
it has web access and cultural reasoning; the Studio has brand voice, template budgets
and the claims guardrail. This design splits the work along that line: **the agent
researches and briefs, the Studio generates.**

## Non-goals

- **Publishing.** No `schedule_post`, no `publish_now`. The agent's last act is a
  reviewable draft. The only irreversible, outward-facing action stays behind a human.
  Token scopes are modelled so adding it later is a tool plus a scope check.
- **Studio-side research.** No web search inside the app. Exposing the Studio's own
  `suggestIdeas` to the agent would compete with the thing being pointed at it.
- **A REST API.** Both consumers are MCP clients. REST would be a second surface with no
  second consumer.
- **A CLI.** Same reasoning. The skill can teach tool usage as well as it could teach
  command syntax.
- **Multi-user.** Single operator for now; tenancy is enforced per token, so this does
  not block the SaaS refactor.

## Architecture

One new surface inside the existing Next.js app. No new container.

```
Hermes / Claude  ──HTTPS + bearer token──▶  /api/mcp   (Next route handler)
                                                 │
                                                 ▼
                                           lib/studio/*   ◀── app/actions/* (UI)
                                                 │
                                 Prisma · OpenAI · fal.ai · ElevenLabs · worker
```

### The extraction

The pipeline currently lives inside session-reading server actions. Extract the middle
into `lib/studio/` — plain functions taking `workspaceId` as their first argument, with
no knowledge of cookies:

| Module | Exports |
|---|---|
| `lib/studio/accounts.ts` | `listAccountsForAgent` (wraps existing `lib/workspace.ts`) |
| `lib/studio/draft.ts` | `createDraft`, `reviseDraft`, `checkDraft`, `listPosts` |
| `lib/studio/media.ts` | `startMedia`, `runMediaJob`, `jobStatus` |
| `lib/studio/templates.ts` | `describeTemplates` (derived from the manifests) |

Existing actions become thin wrappers, keeping their exported names, signatures and
`ActionResult` shape so no wizard component changes:

```ts
export async function generateDraftAction(input: GenerateDraftActionInput) {
  const auth = await requireAuth();
  try { return { ok: true, data: await createDraft(auth.workspaceId, input) } }
  catch (err) { return fail(err) }
}
```

`lib/render.ts` and `lib/publishers/` already take ids rather than sessions and need no
change.

**Verification order matters:** land the extraction and drive the Create wizard in a
browser *before* any MCP code exists, so a UI regression is caught against a small diff.

### Transport

`/api/mcp` uses `createMcpHandler(factory)` from `@modelcontextprotocol/server` (TS SDK
v2). Rationale:

- Protocol 2026-07-28 removed protocol-level sessions and the `initialize` handshake
  entirely; the handler is stateless per request, which is what a Next route handler
  behind Traefik on possibly-multiple instances needs.
- The SDK's default `legacy: 'stateless'` serves **both** 2026-07-28 and 2025-era
  traffic from one handler, so the design does not depend on knowing which revision
  Hermes speaks.
- 2026-07-28 added mandatory `Mcp-Method`/`Mcp-Name` request headers, a required
  `resultType` on every result, required `ttlMs`/`cacheScope` on list results, and
  renumbered error codes. Hand-rolling JSON-RPC would mean reimplementing all of it.

An earlier draft of this design proposed hand-rolling the JSON-RPC layer. That was
decided before checking the current revision and is superseded.

**Compatibility:** Anthropic is rolling 2026-07-28 out across Claude products, and
2025-11-25 clients keep working under a twelve-month deprecation window. Hermes's
revision is unverified and does not need to be, given dual-version serving. If
diagnosis is ever needed, the request log shows whether the client sends
`server/discover` with `io.modelcontextprotocol/protocolVersion: 2026-07-28` or a legacy
`initialize`.

Unused-and-deprecated features (Roots, Sampling, Logging, Dynamic Client Registration)
are not adopted.

### Authentication

New `ApiToken` model, workspace-scoped:

| Field | Purpose |
|---|---|
| `workspaceId` | tenancy — every tool call is scoped to it |
| `name` | display |
| `tokenHash` | sha256 of the token; plaintext shown once at creation, never stored |
| `prefix` | first 8 chars, for identifying a token in the UI |
| `scopes` | `["draft", "media", "render"]`; `publish` reserved, unissued |
| `dailyCapCents` | spend ceiling (see Cost) |
| `dailyDraftCap` | draft-count ceiling |
| `lastUsedAt`, `expiresAt`, `revokedAt` | rotation and audit |

Token format `rss_<base64url>`. `/api/mcp` resolves `Authorization: Bearer …` to a
workspace and rejects revoked or expired tokens — the same tenancy guarantee
`requireAuth()` gives the UI, from a header instead of a cookie. A Settings →
Integrations panel mints and revokes.

Provider keys (OpenAI, fal.ai, ElevenLabs) stay in the existing workspace credential
store. A token grants access to the workspace's *budget*, never to the keys.

Bearer-token auth is sufficient for a private server; full OAuth 2.1 with protected
resource metadata is not required. If Claude's connector UI turns out to require OAuth,
the fallback is Claude Code (which sets headers from config), and a minimal OAuth
wrapper becomes an additive change.

## Tool surface

Ten tools.

### Orientation — read-only, cheap

| Tool | Returns |
|---|---|
| `list_accounts` | id, name, handle, **locale**, pillars, download URL, enabled channels, available voices |
| `describe_template(style?)` | styles, archetypes, default slide sequences, per-slot character and word budgets |
| `list_posts(accountId, status?, limit?)` | recent topics and status — the memory that stops a daily cron repeating itself |
| `list_assets(accountId)` | existing library, so the agent can reuse an image instead of paying fal for a new one |

### Drafting — synchronous, seconds

| Tool | Contract |
|---|---|
| `create_draft` | `{ accountId, style, archetype, topic, angle, pillar, brief }` → `{ postId, doc, issues }`. Pass `postId` to regenerate in place. **`brief`** is the new channel: the agent's cultural research flows into the generation prompt and is persisted on the Post |
| `revise_draft` | `{ postId, slides?: { "2": { headline: "…" } }, caption?, first?, hashtags? }` → re-validated `doc`. Deterministic, no model call, so fixing a budget violation is free |
| `check_draft` | `{ cleared, issues[] }` from `validateDoc` — the same gate publishing enforces |

### Media — job and poll

| Tool | Contract |
|---|---|
| `start_media` | `{ postId, images: "auto" \| [{ slideIndex, slotId, prompt }], voice?: { voiceId, narration } }` → `{ jobId }`. `"auto"` derives prompts via `lib/templates/image-prompt.ts`; explicit prompts let the brief reach the *imagery*, which for the pt-BR account matters as much as the copy. `voice` is accepted only for `reel` and `story` styles and is rejected with a non-retryable error otherwise — the other manifests have no narration surface |
| `start_render` | `{ postId }` → `{ jobId }`, wrapping `ensureRendered`. Pre-warms the slow reel path so review is instant |
| `job_status` | `{ jobId }` → `{ state, done, total, results[], errors[] }`, for both media and render |

### Why job-and-poll rather than webhooks or blocking calls

fal.ai and ElevenLabs take 20–120s (`lib/ai/fal.ts` polls to a 120s deadline). A
blocking call risks a client timeout, and the transport is irrelevant to that — REST
would block just as long. Webhooks only work for Hermes, which is a server; Claude
cannot receive a callback, and the agent's turn has ended by the time work completes
anyway.

So: generalise the pattern the app already has for renders (`RenderJob` → worker →
callback → `renderStatus()` polling, as the Review screen already does). One shared
`Job` table covers media and render so the agent has one polling tool, not two. The
job runs as a detached background task — the app is a long-lived Node container on
dokploy, not serverless — with a `startedAt` staleness check to reap jobs lost to a
restart.

This is also the protocol-sanctioned shape: 2026-07-28 specifies server-minted handles
passed as ordinary tool arguments as the way to hold cross-call state. The official
`io.modelcontextprotocol/tasks` extension is an alternative, not a prerequisite; it can
replace these tools later if both clients support it.

Draft generation stays synchronous — one structured OpenAI call, a few seconds.

## Schema changes

```prisma
model Post {
  // …existing
  brief      String?  @db.Text   // the research that produced this post
  createdVia String   @default("ui")  // "ui" | "agent"
  apiTokenId String?               // which agent made it
}

model ApiToken { /* see Authentication */ }

model Job {
  id          String   @id @default(cuid())
  workspaceId String
  postId      String
  kind        String   // "media" | "render"
  state       String   // "queued" | "running" | "done" | "failed"
  total       Int
  done        Int
  results     Json
  errors      Json
  startedAt   DateTime?
  createdAt   DateTime @default(now())
}
```

`Post.costCents` already exists and is what the spend cap reads.

## Safety

### Concurrency — the 8am collision

The agent must never mutate a post the operator is working on. `create_draft` stamps
`createdVia: "agent"` and `apiTokenId`. Every mutating tool (`revise_draft`,
`start_media`, `start_render`) refuses:

- any post whose `createdVia` is `"ui"`, and
- any post whose `status` is no longer `draft`.

The agent can therefore only finish posts it created, and is structurally incapable of
editing the operator's work or touching anything already scheduled. This is stronger and
simpler than optimistic locking.

### Cost

An unattended cron with fal.ai and ElevenLabs access can spend real money in a loop.

1. **Per-token daily spend cap** (`ApiToken.dailyCapCents`, modest default). Media tools
   add to `Post.costCents` and refuse past the cap with a non-retryable error.
2. **Per-token daily draft cap.** A morning run wants 1–3 posts, not 40; a runaway loop
   hits a wall in minutes.

Both caps count over a **rolling 24 hours** from the time of the call, not a calendar
day. A rolling window needs no timezone decision and cannot be reset by a cron that
happens to straddle midnight.
3. **`start_media` is idempotent per slot.** A slot already holding an image is skipped
   unless `force: true`, so a retried job does not re-bill five images.

### Errors

Tools return structured failures — `{ ok: false, code, message, retryable }` — never
thrown strings. `code` distinguishes a bad argument (fix and retry), a provider outage
(retry later) and a cap breach (stop). Agents loop forever on ambiguous errors;
`retryable` is what prevents that.

## Documentation

Three layers, no duplication.

1. **Protocol-native**, which every client gets automatically:
   - `instructions` on the `server/discover` result — "always `list_accounts` first; the
     account's locale drives everything; never invent statistics; media is job-and-poll."
   - Rich per-tool `description` and JSON Schema on `tools/list`, documenting what
     `brief` is for and what `narration` means.
   - One `prompts` entry, `daily_post(accountId)`, encoding the ordered workflow
     including the research step.
2. **`SKILL.md` for Claude**, owning what the server cannot know: how to research.
   Which sources to check for local holidays and regional events, that Festa Junina is
   regional and June-weighted, that a US "New Year reset" framing lands wrong in a
   Southern-Hemisphere summer, how deep to research before drafting, and the cron
   wiring.
3. **Anti-drift:** the skill's tool reference is generated from the same tool
   definitions the server registers, so it cannot document a signature that no longer
   exists.

## Testing

1. **Unit** — `lib/studio/` functions against the existing mock LLM provider with fal
   and ElevenLabs stubbed. Covers budget enforcement, the ownership rule, cap breaches
   and per-slot idempotency.
2. **Transport** — `/api/mcp` with `server/discover`, `tools/list`, `tools/call`, plus
   the negative cases: absent token, revoked token, expired token, foreign-workspace
   post id, over-cap call, and a `createdVia: "ui"` post rejected by a mutating tool.
   Run once per served protocol revision to prove dual-version handling.
3. **End-to-end** against local Postgres, walking the real morning flow:
   `list_accounts` → `create_draft` for the pt-BR account with a cultural brief →
   `check_draft` → `start_media` → poll → `start_render` → assert a reviewable draft.
4. **UI regression** — drive the Create wizard in a browser after the extraction and
   again after the MCP route lands.

## Deployment

- Migrations for `ApiToken`, `Job`, and the three `Post` columns.
- One new route, `/api/mcp`.
- `STUDIO_PUBLIC_URL` for the endpoint's advertised URL.
- Nothing new in `infra/docker-compose.yml`. `https://studio.<domain>/` continues to
  serve the UI; `https://studio.<domain>/api/mcp` serves tools.

## Future, explicitly deferred

- A `publish` scope and `schedule_post` tool, once the operator trusts the output.
- Migrating job-and-poll to the `io.modelcontextprotocol/tasks` extension if both
  clients support it.
- A durable per-account cultural calendar in the Studio, so the agent stops
  re-researching the same fixed holidays every week.
- OAuth, if a client's connector UI cannot set a header.
