# Studio Agent MCP Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Studio's content pipeline to external agents (Hermes, Claude) over an authenticated MCP endpoint, so a morning cron can leave a finished, image-filled, narrated, rendered draft awaiting human approval.

**Architecture:** Extract the pipeline out of cookie-reading server actions into `lib/studio/*` functions that take an explicit caller. Mount a stateless MCP handler at `/api/mcp` that verifies a bearer token to a workspace and calls those same functions. Slow provider work (fal.ai, ElevenLabs, reel renders) becomes a `Job` row the agent polls.

**Tech Stack:** Next.js 16.2.9 (App Router, `proxy.ts` not `middleware.ts`), React 19.2.4, Prisma 7.8 with `@prisma/adapter-pg`, Postgres, Vitest 4.1.9, Zod 4.4.3, `@modelcontextprotocol/server@2.0.0` + `@modelcontextprotocol/client@2.0.0`.

**Spec:** `docs/superpowers/specs/2026-08-02-studio-agent-mcp-design.md`

## Global Constraints

- **This is NOT the Next.js you know.** Per `apps/web/AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing route or framework code. Route handlers are documented at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- Middleware lives in `src/proxy.ts`, **not** `middleware.ts`.
- Prisma 7 requires the `PrismaPg` driver adapter at runtime — always import the client from `@/lib/db`, never construct `PrismaClient` directly. Generated types come from `@/generated/prisma/client`, enums from `@/generated/prisma/enums`.
- Prisma seed config lives in `prisma.config.ts` under `migrations.seed`, not `package.json`.
- Every module under `lib/` that touches Prisma or secrets starts with `import "server-only";`.
- `lib/studio/*` functions MUST NOT call `requireAuth()`, `getSession()`, `cookies()`, or `revalidatePath()`. They receive a `StudioCaller` and are callable from both a server action and an HTTP route.
- Tools return structured failures, never thrown strings: `{ ok: false, code, message, retryable }`.
- Token format is exactly `rss_<base64url>`; hashed with sha256; **never** logged, and never returned after creation.
- Caps are counted over a **rolling 24 hours** from the time of the call, not a calendar day.
- No `publish` or `schedule` tool ships in this plan. The `publish` scope string is reserved but never issued.
- Run `pnpm --filter @giq/web test` for unit tests, `pnpm --filter @giq/web test:db` for DB-backed tests.

---

## Shared Contracts

These types are defined in Task 2 and used by every later task. Reproduced here so a reader of any single task can find them.

```ts
// src/lib/studio/types.ts
export interface StudioCaller {
  workspaceId: string;
  userId: string;
  /** Token id when the call came from an agent; null when it came from the UI. */
  tokenId: string | null;
  /** Granted scopes. UI callers get every scope. */
  scopes: string[];
}
```

```ts
// src/lib/studio/errors.ts
export type StudioErrorCode =
  | "bad_request"    // caller's arguments are wrong — do not retry unchanged
  | "not_found"      // no such row in this workspace
  | "forbidden"      // scope missing, or post not agent-mutable
  | "conflict"       // post is no longer a draft
  | "cap_reached"    // rolling-24h spend or draft cap hit — stop
  | "provider_error" // fal.ai / ElevenLabs / OpenAI failed — may retry later
  | "internal";

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly retryable: boolean;
  constructor(code: StudioErrorCode, message: string, retryable = false);
}
```

**Note on the spec:** the spec says `lib/studio/*` functions take `workspaceId` as their first argument. This plan refines that to a `StudioCaller`, because `createdVia`, `apiTokenId` and the per-token caps all need the token identity, and threading a second bare string through every signature is worse. The session-free property the spec cares about is preserved.

---

### Task 1: Schema — `ApiToken`, `Job`, and the three `Post` columns

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<timestamp>_agent_mcp_surface/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `ApiToken`, `Job`; `Post.brief`, `Post.createdVia`, `Post.apiTokenId`. Every later task depends on these.

- [ ] **Step 1: Read the existing Post model and its neighbours**

Read `apps/web/prisma/schema.prisma`. Find `model Post` (around line 258) and `model Workspace`. Note the conventions in use: `cuid()` ids, explicit `workspaceId` + relation, `@@index([workspaceId, ...])`, and `onDelete: Cascade` on tenant relations. Match them exactly.

- [ ] **Step 2: Add the three `Post` columns**

Inside `model Post`, after the `topic` / `pillarId` block:

```prisma
  /// The agent's research that produced this post — auditable when a post reads oddly.
  brief String? @db.Text

  /// "ui" | "agent". Agents may only mutate posts they created.
  createdVia String @default("ui")

  /// Which agent token created it. Null for UI-created posts.
  apiTokenId String?
  apiToken   ApiToken? @relation(fields: [apiTokenId], references: [id], onDelete: SetNull)
```

Then add to the existing index block at the bottom of `model Post`:

```prisma
  @@index([apiTokenId, createdAt])
```

That index is what the rolling-24h caps in Task 7 query on.

- [ ] **Step 3: Add the `ApiToken` model**

```prisma
/// A bearer credential letting one external agent drive this workspace.
/// The plaintext is shown once at creation and never stored.
model ApiToken {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// Display name, one per client: "Hermes cron", "Claude web".
  name String

  /// sha256 hex of the full "rss_…" token. The only lookup key.
  tokenHash String @unique
  /// First 12 chars of the token, for identifying it in the UI.
  prefix    String

  /// Granted scopes: "draft" | "media" | "render". "publish" is reserved, never issued.
  scopes String[]

  /// Rolling-24h ceilings. A leaked token has a bounded daily blast radius.
  dailyCapCents Int @default(500)
  dailyDraftCap Int @default(5)

  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  posts Post[]
  jobs  Job[]

  @@index([workspaceId, createdAt])
}
```

- [ ] **Step 4: Add the `Job` model**

```prisma
/// A server-minted handle for slow work the agent polls, covering both media
/// generation and rendering. Protocol 2026-07-28 specifies exactly this shape:
/// server-minted handles passed back as ordinary tool arguments.
model Job {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  postId      String
  post        Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  apiTokenId  String?
  apiToken    ApiToken? @relation(fields: [apiTokenId], references: [id], onDelete: SetNull)

  /// "media" | "render"
  kind String
  /// "queued" | "running" | "done" | "failed"
  state String @default("queued")

  total Int @default(0)
  done  Int @default(0)

  /// [{ slideIndex, slotId, assetId, url }] for media; [{ url }] for render.
  results Json @default("[]")
  /// [{ slideIndex, slotId, message }]
  errors  Json @default("[]")

  /// What this job spent with fal.ai / ElevenLabs, in cents.
  ///
  /// The spend ledger lives here rather than on Post because a job is created at
  /// the moment money is spent. Summing Post.costCents over a rolling window
  /// would miss repeated media calls against an older post — which is exactly
  /// the unbounded loop the cap exists to stop.
  costCents Int @default(0)

  /// Set when the background task picks it up. A queued/running job older than
  /// 10 minutes is presumed lost to a restart and reported failed.
  startedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([workspaceId, createdAt])
  @@index([postId, kind])
  @@index([apiTokenId, createdAt])
}
```

- [ ] **Step 5: Add the back-relations**

In `model Workspace`, add `apiTokens ApiToken[]` and `jobs Job[]`. In `model User`, add `apiTokens ApiToken[]`. In `model Post`, add `jobs Job[]`. Prisma will not validate without both sides of every relation.

- [ ] **Step 6: Generate the migration and client**

```bash
cd apps/web && pnpm prisma migrate dev --name agent_mcp_surface
```

Expected: a new folder under `prisma/migrations/`, the migration applied to your local database, and the client regenerated into `src/generated/prisma/`. If it reports drift, stop and report — do not use `--force-reset` against a database with real drafts in it.

- [ ] **Step 7: Verify the client typechecks**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: PASS. This proves the generated types are consistent; it does not exercise behaviour yet, which is Task 2's job.

- [ ] **Step 8: Commit**

```bash
git add apps/web/prisma
git commit -m "Add ApiToken, Job and agent provenance columns

An agent needs a credential that is not a cookie, a handle for work too
slow to answer inline, and a way for the app to tell its own drafts from
the operator's. The caps live on the token rather than the workspace so a
leaked credential has a bounded daily cost and revoking one client does
not disturb the other."
```

---

### Task 2: Foundation — caller, errors, token mint/verify, and the DB test harness

**Files:**
- Create: `apps/web/src/lib/studio/types.ts`
- Create: `apps/web/src/lib/studio/errors.ts`
- Create: `apps/web/src/lib/studio/tokens.ts`
- Create: `apps/web/vitest.integration.config.ts`
- Create: `apps/web/src/lib/studio/__tests__/helpers.ts`
- Create: `apps/web/src/lib/studio/__tests__/tokens.test.ts` (unit, no DB)
- Create: `apps/web/src/lib/studio/__tests__/tokens.itest.ts` (DB-backed)
- Modify: `apps/web/package.json` (add `test:db` script)

**Interfaces:**
- Consumes: `ApiToken` model from Task 1.
- Produces:
  - `interface StudioCaller { workspaceId: string; userId: string; tokenId: string | null; scopes: string[] }`
  - `class StudioError` with `code: StudioErrorCode`, `retryable: boolean`
  - `function hashToken(token: string): string`
  - `function mintToken(input: { workspaceId: string; userId: string; name: string; scopes: string[]; dailyCapCents?: number; dailyDraftCap?: number; expiresAt?: Date | null }): Promise<{ token: string; id: string; prefix: string }>`
  - `function verifyToken(bearer: string | null): Promise<StudioCaller>` — throws `StudioError("forbidden", …)`
  - `function requireScope(caller: StudioCaller, scope: string): void`
  - `function listTokens(workspaceId: string): Promise<TokenSummary[]>`
  - `function revokeToken(workspaceId: string, id: string): Promise<void>`
  - test helper `withTestWorkspace(fn)`

- [ ] **Step 1: Write the shared caller type**

Create `apps/web/src/lib/studio/types.ts`:

```ts
/**
 * The identity every studio function is called with.
 *
 * Deliberately not a session: these functions serve both a server action (where
 * the caller came from an iron-session cookie) and the MCP route (where it came
 * from a bearer token). Nothing here can read a cookie.
 */
export interface StudioCaller {
  workspaceId: string;
  userId: string;
  /** Token id when the call came from an agent; null when it came from the UI. */
  tokenId: string | null;
  /** Granted scopes. UI callers hold every scope. */
  scopes: string[];
}

export const ALL_SCOPES = ["draft", "media", "render"] as const;
export type Scope = (typeof ALL_SCOPES)[number];

/** The caller a server action builds — full scopes, no token. */
export function uiCaller(workspaceId: string, userId: string): StudioCaller {
  return { workspaceId, userId, tokenId: null, scopes: [...ALL_SCOPES] };
}
```

- [ ] **Step 2: Write the error type**

Create `apps/web/src/lib/studio/errors.ts`:

```ts
/**
 * Structured failures.
 *
 * Agents loop forever on ambiguous errors, so every failure carries a code the
 * caller can branch on and an explicit `retryable` flag. A bad argument must
 * never look like a transient outage.
 */
export type StudioErrorCode =
  | "bad_request"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "cap_reached"
  | "provider_error"
  | "internal";

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly retryable: boolean;

  constructor(code: StudioErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "StudioError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Anything thrown deeper than us becomes a non-retryable internal error. */
export function asStudioError(err: unknown): StudioError {
  if (err instanceof StudioError) return err;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return new StudioError("internal", message);
}
```

- [ ] **Step 3: Write the failing unit test for token hashing and shape**

Create `apps/web/src/lib/studio/__tests__/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateToken, hashToken } from "../tokens";

/**
 * The pure half of tokens.ts. The DB-backed half is in tokens.itest.ts.
 *
 * These assert the two properties the auth path depends on: that the hash is a
 * plain sha256 of the whole token (so lookup is a single indexed query), and
 * that the prefix leaks only what the UI needs to identify a row.
 */
describe("generateToken", () => {
  it("produces an rss_-prefixed token with 256 bits of entropy", () => {
    const { token } = generateToken();
    expect(token.startsWith("rss_")).toBe(true);
    // 32 bytes base64url encodes to 43 chars, no padding.
    expect(token.slice(4)).toHaveLength(43);
    expect(token.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateToken().token));
    expect(seen.size).toBe(200);
  });

  it("derives a 12-char prefix that is not enough to reconstruct the token", () => {
    const { token, prefix } = generateToken();
    expect(prefix).toBe(token.slice(0, 12));
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length);
  });

  it("hashes the full token with sha256", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).toHaveLength(64);
  });
});

describe("hashToken", () => {
  it("is deterministic, so an incoming bearer resolves by equality", () => {
    expect(hashToken("rss_abc")).toBe(hashToken("rss_abc"));
  });

  it("differs for different tokens", () => {
    expect(hashToken("rss_abc")).not.toBe(hashToken("rss_abd"));
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run src/lib/studio/__tests__/tokens.test.ts
```

Expected: FAIL — `Failed to resolve import "../tokens"`.

- [ ] **Step 5: Write `tokens.ts`**

Create `apps/web/src/lib/studio/tokens.ts`:

```ts
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { StudioError } from "./errors";
import { ALL_SCOPES, type StudioCaller } from "./types";

/**
 * Agent bearer tokens.
 *
 * sha256 rather than bcrypt/argon2 on purpose: a slow KDF exists to frustrate
 * brute-forcing low-entropy human passwords, and this is 256 bits of CSPRNG
 * output verified on every single tool call. A work factor would only add
 * latency to the hot path.
 *
 * Hashed rather than encrypted (unlike lib/crypto.ts, which must recover
 * provider keys to call fal.ai): nothing ever needs to read a token back.
 */

const TOKEN_BYTES = 32;
const PREFIX_LENGTH = 12;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface GeneratedToken {
  token: string;
  tokenHash: string;
  prefix: string;
}

/** Pure generation, separated from persistence so it is unit-testable. */
export function generateToken(): GeneratedToken {
  const token = `rss_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX_LENGTH) };
}

export interface MintTokenInput {
  workspaceId: string;
  userId: string;
  name: string;
  scopes: string[];
  dailyCapCents?: number;
  dailyDraftCap?: number;
  expiresAt?: Date | null;
}

/**
 * Mint a token. The plaintext is returned exactly once and never stored — the
 * caller must show it to the operator immediately or lose it.
 */
export async function mintToken(
  input: MintTokenInput,
): Promise<{ token: string; id: string; prefix: string }> {
  const name = input.name.trim();
  if (!name) throw new StudioError("bad_request", "Give the token a name.");

  const unknown = input.scopes.filter((s) => !ALL_SCOPES.includes(s as never));
  if (unknown.length) {
    throw new StudioError("bad_request", `Unknown scope: ${unknown.join(", ")}`);
  }
  if (!input.scopes.length) {
    throw new StudioError("bad_request", "Grant the token at least one scope.");
  }

  const { token, tokenHash, prefix } = generateToken();
  const row = await prisma.apiToken.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      name,
      tokenHash,
      prefix,
      scopes: input.scopes,
      ...(input.dailyCapCents !== undefined ? { dailyCapCents: input.dailyCapCents } : {}),
      ...(input.dailyDraftCap !== undefined ? { dailyDraftCap: input.dailyDraftCap } : {}),
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });

  return { token, id: row.id, prefix };
}

/**
 * Resolve an `Authorization: Bearer …` value to a caller.
 *
 * One indexed lookup on the hash — no scan, and no comparison of secrets.
 * Every rejection is the same shape so a caller cannot distinguish "no such
 * token" from "revoked" by the error alone.
 */
export async function verifyToken(bearer: string | null): Promise<StudioCaller> {
  const denied = () => new StudioError("forbidden", "Invalid or expired token.");

  if (!bearer) throw denied();
  const value = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : bearer.trim();
  if (!value.startsWith("rss_")) throw denied();

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(value) },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row) throw denied();
  if (row.revokedAt) throw denied();
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw denied();

  // Best-effort; a failed touch must not fail the request.
  void prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    tokenId: row.id,
    scopes: row.scopes,
  };
}

export function requireScope(caller: StudioCaller, scope: string): void {
  if (!caller.scopes.includes(scope)) {
    throw new StudioError("forbidden", `This token lacks the "${scope}" scope.`);
  }
}

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  dailyCapCents: number;
  dailyDraftCap: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listTokens(workspaceId: string): Promise<TokenSummary[]> {
  return prisma.apiToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      dailyCapCents: true,
      dailyDraftCap: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

/** Revoke keeps the row for audit; rotation is mint-new-then-revoke-old. */
export async function revokeToken(workspaceId: string, id: string): Promise<void> {
  const { count } = await prisma.apiToken.updateMany({
    where: { id, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw new StudioError("not_found", "Token not found.");
}
```

- [ ] **Step 6: Run the unit test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run src/lib/studio/__tests__/tokens.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Add the DB-backed test config**

Create `apps/web/vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * DB-backed tests, kept apart from `pnpm test` so the unit suite stays runnable
 * with no Postgres. These need DATABASE_URL pointing at a database you do not
 * mind writing to — they create a throwaway workspace per test and delete it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    // Each test owns its own workspace, but they share one Postgres connection
    // pool; running them serially keeps the failure output readable.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 8: Add the `test:db` script**

In `apps/web/package.json`, alongside `"test": "vitest run"`:

```json
    "test:db": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 9: Write the DB test helper**

Create `apps/web/src/lib/studio/__tests__/helpers.ts`:

```ts
import { prisma } from "@/lib/db";
import { uiCaller, type StudioCaller } from "../types";

/**
 * A throwaway workspace, user and brand account per test.
 *
 * Cascade deletes do the cleanup: every tenant table hangs off Workspace with
 * onDelete: Cascade, so removing the workspace removes the rows the test made
 * even when it failed partway through.
 */
export interface TestFixture {
  workspaceId: string;
  userId: string;
  accountId: string;
  caller: StudioCaller;
}

let counter = 0;

export async function withTestWorkspace<T>(fn: (f: TestFixture) => Promise<T>): Promise<T> {
  const tag = `itest-${process.pid}-${counter++}`;

  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag },
    select: { id: true },
  });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: `${tag}@example.test`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });

  const account = await prisma.brandAccount.create({
    data: {
      workspaceId: workspace.id,
      name: "Test Brand",
      handle: "@testbrand",
      locale: "en",
      voiceDescription: "Plain, calm, evidence-led.",
      tones: ["calm"],
      readingLevel: "grade7",
      claimsGuardrail: true,
    },
    select: { id: true },
  });

  try {
    return await fn({
      workspaceId: workspace.id,
      userId: user.id,
      accountId: account.id,
      caller: uiCaller(workspace.id, user.id),
    });
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
  }
}
```

**Before running:** open `apps/web/prisma/schema.prisma` and check the required fields on `Workspace`, `User` and `BrandAccount`. If any required field is missing from the creates above, add it — the schema is the authority, not this snippet.

- [ ] **Step 10: Write the failing DB test for verify/revoke**

Create `apps/web/src/lib/studio/__tests__/tokens.itest.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { StudioError } from "../errors";
import { listTokens, mintToken, requireScope, revokeToken, verifyToken } from "../tokens";
import { withTestWorkspace } from "./helpers";

/**
 * The auth path's negative cases matter more than the happy one: every rejection
 * here is a door someone could otherwise walk through.
 */
describe("verifyToken", () => {
  it("resolves a fresh token to its workspace, user and scopes", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes cron",
        scopes: ["draft", "media"],
      });

      const caller = await verifyToken(`Bearer ${token}`);
      expect(caller).toEqual({
        workspaceId: f.workspaceId,
        userId: f.userId,
        tokenId: id,
        scopes: ["draft", "media"],
      });
    }));

  it("accepts the raw value as well as the Bearer form", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await expect(verifyToken(token)).resolves.toMatchObject({ workspaceId: f.workspaceId });
    }));

  it("never stores the plaintext", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      const row = await prisma.apiToken.findUniqueOrThrow({ where: { id } });
      expect(JSON.stringify(row)).not.toContain(token.slice(4));
    }));

  it("rejects an absent header", async () => {
    await expect(verifyToken(null)).rejects.toBeInstanceOf(StudioError);
  });

  it("rejects a well-formed token that was never issued", async () => {
    await expect(verifyToken("Bearer rss_notarealtokenatall")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects a value without the rss_ prefix without touching the database", async () => {
    await expect(verifyToken("Bearer hunter2")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a revoked token", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await revokeToken(f.workspaceId, id);
      await expect(verifyToken(token)).rejects.toMatchObject({ code: "forbidden" });
    }));

  it("rejects an expired token", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(verifyToken(token)).rejects.toMatchObject({ code: "forbidden" });
    }));

  it("records lastUsedAt so the operator can see which agent actually ran", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await verifyToken(token);
      // The touch is fire-and-forget, so poll briefly rather than assume ordering.
      let lastUsedAt: Date | null = null;
      for (let i = 0; i < 20 && !lastUsedAt; i++) {
        await new Promise((r) => setTimeout(r, 25));
        lastUsedAt = (await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt;
      }
      expect(lastUsedAt).toBeInstanceOf(Date);
    }));
});

describe("mintToken", () => {
  it("refuses an unknown scope", () =>
    withTestWorkspace(async (f) => {
      await expect(
        mintToken({
          workspaceId: f.workspaceId,
          userId: f.userId,
          name: "t",
          scopes: ["publish"],
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));

  it("refuses an empty name and an empty scope list", () =>
    withTestWorkspace(async (f) => {
      await expect(
        mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "  ", scopes: ["draft"] }),
      ).rejects.toMatchObject({ code: "bad_request" });
      await expect(
        mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "t", scopes: [] }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));
});

describe("listTokens and revokeToken", () => {
  it("lists prefixes but no hashes, and will not revoke another workspace's token", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        const { id, prefix } = await mintToken({
          workspaceId: f.workspaceId,
          userId: f.userId,
          name: "Hermes cron",
          scopes: ["draft"],
        });

        const rows = await listTokens(f.workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ name: "Hermes cron", prefix });
        expect(rows[0]).not.toHaveProperty("tokenHash");

        await expect(revokeToken(other.workspaceId, id)).rejects.toMatchObject({
          code: "not_found",
        });
      }),
    ));
});

describe("requireScope", () => {
  it("throws forbidden when the scope is absent", () => {
    const caller = { workspaceId: "w", userId: "u", tokenId: "t", scopes: ["draft"] };
    expect(() => requireScope(caller, "draft")).not.toThrow();
    expect(() => requireScope(caller, "media")).toThrow(StudioError);
  });
});
```

- [ ] **Step 11: Run the DB tests to verify they pass**

Make sure Postgres is up (`bash start.sh` or `docker compose -f infra/docker-compose.yml up -d db`) and `DATABASE_URL` is set, then:

```bash
cd apps/web && pnpm test:db
```

Expected: PASS. If `withTestWorkspace` fails on a missing required column, fix the helper against `schema.prisma` — that is the expected first failure, not a bug in `tokens.ts`.

- [ ] **Step 12: Run the unit suite to confirm nothing regressed**

```bash
cd apps/web && pnpm test
```

Expected: PASS, including the pre-existing `image-meta` tests.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib/studio apps/web/vitest.integration.config.ts apps/web/package.json
git commit -m "Mint and verify agent tokens

Auth resolves a bearer to a workspace in one indexed lookup on the hash,
so there is no scan and no secret comparison. Every rejection returns the
same message: a caller must not be able to tell an unissued token from a
revoked one.

Adds a second vitest config for DB-backed tests so the unit suite still
runs with no Postgres."
```

---

### Task 3: Carry the brief into generation

**Files:**
- Modify: `apps/web/src/lib/ai/generate.ts`
- Create: `apps/web/src/lib/ai/__tests__/generate-prompt.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GenerateDraftInput` gains `brief?: string | null`; new exported `function userPromptForTest(...)` is **not** added — instead `buildUserPrompt` is exported so the prompt is testable without calling OpenAI.

- [ ] **Step 1: Read the current prompt builder**

Read `apps/web/src/lib/ai/generate.ts`. Note that `userPrompt(brand, style, kinds, topic, pillar)` is module-private and that `generateDraft` passes its result straight to `completeJson`. The brief has to reach that string.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/ai/__tests__/generate-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildUserPrompt, type BrandVoice } from "../generate";

/**
 * The brief is the whole point of the agent surface: without it, locale means
 * nothing more than "write in pt-BR" and no amount of research reaches the copy.
 * These tests assert it lands in the prompt, and that the prompt does not break
 * when it is absent (the UI never sends one).
 */
const BRAND: BrandVoice = {
  name: "Gastric IQ Brasil",
  handle: "@gastriciq.br",
  locale: "pt_BR",
  voiceDescription: "Calmo, direto, sem culpa.",
  tones: ["calm"],
  readingLevel: "grade7",
  claimsGuardrail: true,
  downloadUrl: "https://example.test/app",
};

describe("buildUserPrompt", () => {
  it("includes the brief under a labelled heading when one is supplied", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "Festa Junina sem exagero", null, {
      angle: "Comida de festa sem culpa",
      brief: "Festa Junina peaks in late June; pamonha and quentão are the staples.",
    });

    expect(prompt).toContain("RESEARCH BRIEF");
    expect(prompt).toContain("pamonha");
    expect(prompt).toContain("Comida de festa sem culpa");
  });

  it("tells the model the brief is context, not copy to reproduce", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "t", null, {
      brief: "Festa Junina peaks in late June.",
    });
    expect(prompt).toMatch(/do not quote|context|ground/i);
  });

  it("omits the heading entirely when there is no brief", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "t", null, {});
    expect(prompt).not.toContain("RESEARCH BRIEF");
  });

  it("still contains the topic and slide specs with no brief, so the UI path is unchanged", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "Protein first", "Nutrition", {});
    expect(prompt).toContain("Protein first");
    expect(prompt).toContain("Nutrition");
    expect(prompt).toContain("SLIDE 0");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run src/lib/ai/__tests__/generate-prompt.test.ts
```

Expected: FAIL — `buildUserPrompt` is not exported.

- [ ] **Step 4: Rename and export the prompt builder with a brief**

In `apps/web/src/lib/ai/generate.ts`, change the `userPrompt` function signature and export it:

```ts
export interface DraftContext {
  /** How to treat the topic — one sentence from the agent's plan. */
  angle?: string | null;
  /** The agent's research: local events, holidays, seasonality, culture. */
  brief?: string | null;
}

export function buildUserPrompt(
  brand: BrandVoice,
  style: TemplateStyleId,
  kinds: string[],
  topic: string,
  pillar?: string | null,
  ctx: DraftContext = {},
): string {
```

Keep the existing body. Immediately before the final `return [...]`, add:

```ts
  // The brief is research, not copy. Said plainly, because a model handed a
  // paragraph of context will otherwise lift phrases out of it verbatim.
  const brief = ctx.brief?.trim()
    ? [
        ``,
        `RESEARCH BRIEF — context to ground this post in, gathered for this account's locale.`,
        `Use it to choose references, timing and examples the reader will recognise. It is`,
        `background: do not quote it, restate it, or treat its wording as copy.`,
        ctx.brief.trim(),
      ].join("\n")
    : "";
```

Then in the returned array, add `ctx.angle?.trim() ? `Angle: ${ctx.angle.trim()}` : ""` directly after the `Topic:` line, and `brief` directly after that. The array is already `.filter()`ed, so empty strings drop out.

- [ ] **Step 5: Thread it through `generateDraft`**

In the same file, extend the input interface:

```ts
export interface GenerateDraftInput {
  workspaceId: string;
  brand: BrandVoice;
  style: TemplateStyleId;
  kinds: string[];
  topic: string;
  pillar?: string | null;
  /** How to treat the topic. */
  angle?: string | null;
  /** The agent's cultural research. */
  brief?: string | null;
  existing?: SlideDoc[];
}
```

and change the `completeJson` call's fourth argument from
`userPrompt(brand, style, kinds, topic, pillar)` to
`buildUserPrompt(brand, style, kinds, topic, pillar, { angle: input.angle, brief: input.brief })`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run src/lib/ai/__tests__/generate-prompt.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck, since the rename touches a call site**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: PASS. If it reports `userPrompt` is undefined, you missed the call site inside `generateDraft`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/ai/generate.ts apps/web/src/lib/ai/__tests__/generate-prompt.test.ts
git commit -m "Let a research brief reach the generation prompt

Generation took only topic and pillar, so locale meant nothing more than
'write in pt-BR' and no research could influence the copy. The brief is
labelled as background with an explicit instruction not to quote it: a
model handed a paragraph of context lifts phrases out of it otherwise.

Exports the prompt builder so this is testable without calling OpenAI."
```

---

### Task 4: Extract the draft pipeline into `lib/studio/draft.ts`

**Files:**
- Create: `apps/web/src/lib/studio/draft.ts`
- Create: `apps/web/src/lib/studio/posts.ts`
- Modify: `apps/web/src/app/actions/create.ts`
- Create: `apps/web/src/lib/studio/__tests__/draft.itest.ts`

**Interfaces:**
- Consumes: `StudioCaller`, `StudioError`, `uiCaller` (Task 2); `generateDraft` with `brief`/`angle` (Task 3).
- Produces:
  - `interface CreateDraftInput { accountId: string; style: TemplateStyleId; archetype: string; topic: string; angle?: string | null; pillar?: string | null; brief?: string | null; postId?: string }`
  - `interface DraftResult { postId: string; doc: PostDoc; issues: string[] }`
  - `function createDraft(caller: StudioCaller, input: CreateDraftInput): Promise<DraftResult>`
  - `interface RevisePatch { slides?: Record<string, Record<string, SlotValue>>; caption?: string; first?: string; hashtags?: string[] }`
  - `function reviseDraft(caller: StudioCaller, postId: string, patch: RevisePatch): Promise<DraftResult>`
  - `function checkDraft(caller: StudioCaller, postId: string): Promise<{ cleared: boolean; issues: string[] }>`
  - `function saveDoc(caller: StudioCaller, postId: string, doc: PostDoc): Promise<void>`
  - `function describeIssues(issues: SlotIssue[]): string[]`
  - From `posts.ts`: `function ownedPost(caller, postId, opts?)`, `function assertAgentMutable(caller, post)`, `interface PostSummary`, `function listPosts(caller, opts): Promise<PostSummary[]>`

- [ ] **Step 1: Read what you are extracting**

Read `apps/web/src/app/actions/create.ts` end to end. The functions moving are the bodies of `generateDraftAction`, `saveDraftAction` and `checkDraftAction`, plus the private helpers `ownedAccount`, `ownedPost` and `brandVoice`. Note that `ownedAccount`/`ownedPost` call `requireAuth()` internally — that is exactly what must not survive the move.

- [ ] **Step 2: Write the ownership and lookup module**

Create `apps/web/src/lib/studio/posts.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/db";
import { StudioError } from "./errors";
import type { StudioCaller } from "./types";

/**
 * Workspace-scoped post lookup and the agent mutation rule.
 *
 * The rule exists for the 8am collision: the operator is reviewing a draft while
 * a cron's retry writes to it. Rather than optimistic locking, an agent may only
 * ever touch posts it created and only while they are still drafts — a stronger
 * and simpler guarantee.
 */

export async function ownedPost(caller: StudioCaller, postId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId: caller.workspaceId },
    include: { account: { include: { channels: true, pillars: true, logoAsset: true } } },
  });
  if (!post) throw new StudioError("not_found", "Post not found.");
  return post;
}

export async function ownedAccount(caller: StudioCaller, accountId: string) {
  const account = await prisma.brandAccount.findFirst({
    where: { id: accountId, workspaceId: caller.workspaceId },
    include: {
      channels: { orderBy: { platform: "asc" } },
      pillars: { orderBy: { position: "asc" } },
      logoAsset: true,
    },
  });
  if (!account) throw new StudioError("not_found", "Account not found.");
  return account;
}

/**
 * Refuse to let an agent mutate the operator's work, or anything already out
 * the door. UI callers (tokenId === null) are unrestricted apart from status.
 */
export function assertAgentMutable(
  caller: StudioCaller,
  post: { createdVia: string; apiTokenId: string | null; status: string },
): void {
  if (post.status !== "draft") {
    throw new StudioError("conflict", `This post is ${post.status}, not a draft — it can no longer be edited.`);
  }
  if (caller.tokenId === null) return;

  if (post.createdVia !== "agent") {
    throw new StudioError("forbidden", "This post was created in the app; an agent may not edit it.");
  }
  if (post.apiTokenId !== caller.tokenId) {
    throw new StudioError("forbidden", "This post belongs to a different agent token.");
  }
}

export interface PostSummary {
  id: string;
  style: string;
  archetype: string;
  topic: string | null;
  pillar: string | null;
  status: string;
  createdVia: string;
  slideCount: number;
  hasVoice: boolean;
  renderedCount: number;
  updatedAt: string;
}

export interface ListPostsOptions {
  accountId?: string;
  status?: string;
  limit?: number;
}

/**
 * Recent posts, newest first — the memory that stops a daily cron re-posting
 * last Tuesday's idea.
 */
export async function listPosts(
  caller: StudioCaller,
  opts: ListPostsOptions = {},
): Promise<PostSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const rows = await prisma.post.findMany({
    where: {
      workspaceId: caller.workspaceId,
      ...(opts.accountId ? { accountId: opts.accountId } : {}),
      ...(opts.status ? { status: opts.status as never } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      style: true,
      archetype: true,
      topic: true,
      status: true,
      createdVia: true,
      doc: true,
      voiceAssetId: true,
      mediaUrls: true,
      updatedAt: true,
      pillar: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    style: r.style,
    archetype: r.archetype,
    topic: r.topic,
    pillar: r.pillar?.name ?? null,
    status: r.status,
    createdVia: r.createdVia,
    slideCount: Array.isArray((r.doc as { slides?: unknown[] })?.slides)
      ? ((r.doc as { slides: unknown[] }).slides.length as number)
      : 0,
    hasVoice: !!r.voiceAssetId,
    renderedCount: r.mediaUrls.length,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/src/lib/studio/__tests__/draft.itest.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { checkDraft, createDraft, reviseDraft } from "../draft";
import { listPosts } from "../posts";
import { mintToken, verifyToken } from "../tokens";
import { withTestWorkspace } from "./helpers";
import type { PostDoc } from "@/lib/templates/types";

/**
 * The OpenAI call is the only thing stubbed. Everything else — manifest
 * coercion, budget enforcement, persistence, the ownership rule — runs for real,
 * because those are exactly the places an agent-driven path could diverge from
 * the wizard's.
 */
vi.mock("@/lib/ai/client", () => ({
  completeJson: vi.fn(async () => ({
    slides: { "0": { kicker: "Kicker", hook: "A hook that fits the budget" } },
    caption: "A caption. → link in bio",
    firstComment: "https://example.test/app",
    hashtags: ["#bariatric", "#glp1"],
  })),
  openaiFor: vi.fn(),
}));

// A workspace needs an OpenAI credential before generation is attempted; the
// stub above means the key is never used, but requireCredential still reads it.
async function seedOpenAiCredential(workspaceId: string) {
  const { encryptSecret } = await import("@/lib/crypto");
  await prisma.credential.create({
    data: {
      workspaceId,
      provider: "openai",
      apiKey: encryptSecret("sk-test-not-real"),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDraft", () => {
  it("persists a draft with the brief and stamps UI provenance", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);

      const result = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "Protein first",
        brief: "Festa Junina peaks in late June.",
      });

      expect(result.postId).toBeTruthy();
      expect(result.doc.slides.length).toBeGreaterThan(0);

      const row = await prisma.post.findUniqueOrThrow({ where: { id: result.postId } });
      expect(row.createdVia).toBe("ui");
      expect(row.apiTokenId).toBeNull();
      expect(row.brief).toBe("Festa Junina peaks in late June.");
      expect(row.caption).toContain("link in bio");
      expect(row.status).toBe("draft");
    }));

  it("stamps agent provenance when called with a token", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
      });
      const agent = await verifyToken(token);

      const { postId } = await createDraft(agent, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "Protein first",
      });

      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      expect(row.createdVia).toBe("agent");
      expect(row.apiTokenId).toBe(id);
    }));

  it("rejects an unknown archetype, an empty topic and a foreign account", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        await seedOpenAiCredential(f.workspaceId);
        const base = { accountId: f.accountId, style: "carousel" as const, topic: "t" };

        await expect(
          createDraft(f.caller, { ...base, archetype: "not-a-real-kind" }),
        ).rejects.toMatchObject({ code: "bad_request" });

        await expect(
          createDraft(f.caller, { ...base, archetype: "1a-knockout", topic: "   " }),
        ).rejects.toMatchObject({ code: "bad_request" });

        await expect(
          createDraft(f.caller, { ...base, accountId: other.accountId, archetype: "1a-knockout" }),
        ).rejects.toMatchObject({ code: "not_found" });
      }),
    ));
});

describe("the agent mutation rule", () => {
  it("stops an agent editing a UI-created draft", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { postId } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "Operator's own post",
      });

      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
      });
      const agent = await verifyToken(token);

      await expect(reviseDraft(agent, postId, { caption: "hijacked" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }));

  it("stops one agent token editing another's draft", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const a = await verifyToken(
        (await mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "A", scopes: ["draft"] })).token,
      );
      const b = await verifyToken(
        (await mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "B", scopes: ["draft"] })).token,
      );

      const { postId } = await createDraft(a, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "A's post",
      });

      await expect(reviseDraft(b, postId, { caption: "x" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }));

  it("refuses any caller once the post has left draft", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { postId } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      });
      await prisma.post.update({ where: { id: postId }, data: { status: "scheduled" } });

      await expect(reviseDraft(f.caller, postId, { caption: "x" })).rejects.toMatchObject({
        code: "conflict",
      });
    }));
});

describe("reviseDraft", () => {
  it("patches one slot without a model call and re-imposes the budget", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { completeJson } = await import("@/lib/ai/client");

      const { postId } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      });
      expect(completeJson).toHaveBeenCalledTimes(1);

      const result = await reviseDraft(f.caller, postId, {
        slides: { "0": { hook: "x".repeat(200) } },
        caption: "Rewritten caption",
      });

      // No second generation — a revision is deterministic and free.
      expect(completeJson).toHaveBeenCalledTimes(1);
      // The carousel knockout hook is capped at 42 chars by the manifest.
      expect((result.doc.slides[0].f.hook as string).length).toBeLessThanOrEqual(42);
      expect(result.doc.caption).toBe("Rewritten caption");

      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      expect(row.caption).toBe("Rewritten caption");
    }));

  it("leaves untouched slots alone", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { postId, doc } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      });
      const before = doc.slides[0].f.kicker;

      const after = await reviseDraft(f.caller, postId, { caption: "Only the caption" });
      expect(after.doc.slides[0].f.kicker).toEqual(before);
    }));

  it("rejects a slide index that does not exist", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { postId } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      });
      await expect(
        reviseDraft(f.caller, postId, { slides: { "99": { hook: "x" } } }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));
});

describe("checkDraft", () => {
  it("reports a missing required slot in prose an agent can act on", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { postId } = await createDraft(f.caller, {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      });

      // Empty the required hook directly, bypassing the budget re-imposition.
      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      const doc = row.doc as unknown as PostDoc;
      doc.slides[0].f.hook = "";
      await prisma.post.update({
        where: { id: postId },
        data: { doc: doc as never },
      });

      const result = await checkDraft(f.caller, postId);
      expect(result.cleared).toBe(false);
      expect(result.issues.join(" ")).toMatch(/Slide 1/);
      expect(result.issues.join(" ")).toMatch(/Hook/i);
    }));
});

describe("listPosts", () => {
  it("returns newest first, scoped to the workspace, with a clamped limit", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        await seedOpenAiCredential(f.workspaceId);
        await seedOpenAiCredential(other.workspaceId);

        const first = await createDraft(f.caller, {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "First",
        });
        const second = await createDraft(f.caller, {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "Second",
        });
        await createDraft(other.caller, {
          accountId: other.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "Someone else's",
        });

        const rows = await listPosts(f.caller, { accountId: f.accountId });
        expect(rows.map((r) => r.id)).toEqual([second.postId, first.postId]);
        expect(rows.map((r) => r.topic)).not.toContain("Someone else's");
        expect(rows[0].slideCount).toBeGreaterThan(0);

        const clamped = await listPosts(f.caller, { limit: 9999 });
        expect(clamped.length).toBeLessThanOrEqual(100);
      }),
    ));
});
```

**Before running:** check `model Credential` in `schema.prisma` for its real field names (`provider`, `apiKey`, and whether a unique constraint needs more fields). Fix `seedOpenAiCredential` to match; the schema is the authority.

- [ ] **Step 4: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/draft.itest.ts
```

Expected: FAIL — `Failed to resolve import "../draft"`.

- [ ] **Step 5: Write `lib/studio/draft.ts`**

Create `apps/web/src/lib/studio/draft.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/db";
import { generateDraft, type BrandVoice } from "@/lib/ai/generate";
import { getManifest } from "@/lib/templates/manifests";
import { coerceFields, validateDoc, type SlotIssue } from "@/lib/templates/doc";
import type { PostDoc, SlotValue, TemplateStyleId } from "@/lib/templates/types";
import type { Prisma } from "@/generated/prisma/client";
import { StudioError } from "./errors";
import { assertAgentMutable, ownedAccount, ownedPost } from "./posts";
import type { StudioCaller } from "./types";

/**
 * The draft pipeline, session-free.
 *
 * This is the code both the Create wizard and the MCP tools run — the server
 * actions in app/actions/create.ts are now thin auth wrappers over it. Nothing
 * here may read a cookie or revalidate a path.
 */

export type BrandAccountRow = Awaited<ReturnType<typeof ownedAccount>>;

export function brandVoice(account: BrandAccountRow): BrandVoice {
  return {
    name: account.name,
    handle: account.handle,
    locale: account.locale === "pt_BR" ? "pt_BR" : "en",
    voiceDescription: account.voiceDescription,
    tones: account.tones,
    readingLevel: account.readingLevel,
    claimsGuardrail: account.claimsGuardrail,
    downloadUrl: account.downloadUrl,
  };
}

/** Manifest issues as sentences an agent can act on without reading the schema. */
export function describeIssues(issues: SlotIssue[]): string[] {
  return issues.map((i) =>
    i.slideIndex < 0
      ? `${i.label} is ${i.problem === "missing" ? "empty" : "too long"}`
      : `Slide ${i.slideIndex + 1}: ${i.label} is ${
          i.problem === "missing" ? "empty" : "over its limit"
        }`,
  );
}

export interface CreateDraftInput {
  accountId: string;
  style: TemplateStyleId;
  archetype: string;
  topic: string;
  angle?: string | null;
  pillar?: string | null;
  brief?: string | null;
  /** Set when regenerating an existing draft, so filled image slots survive. */
  postId?: string;
}

export interface DraftResult {
  postId: string;
  doc: PostDoc;
  issues: string[];
}

export async function createDraft(
  caller: StudioCaller,
  input: CreateDraftInput,
): Promise<DraftResult> {
  const account = await ownedAccount(caller, input.accountId);
  const man = getManifest(input.style);

  if (!man.kinds[input.archetype]) {
    const known = Object.keys(man.kinds).join(", ");
    throw new StudioError(
      "bad_request",
      `Unknown archetype "${input.archetype}" for style "${input.style}". Known: ${known}`,
    );
  }
  if (!input.topic.trim()) throw new StudioError("bad_request", "Give the post a topic first.");

  // Regenerating keeps the current sequence; a fresh draft uses the manifest's
  // default sequence for the chosen archetype.
  let kinds = man.defaultSequence(input.archetype);
  let existing: PostDoc["slides"] | undefined;

  if (input.postId) {
    const post = await ownedPost(caller, input.postId);
    assertAgentMutable(caller, post);
    const doc = post.doc as unknown as PostDoc;
    if (doc?.slides?.length) {
      kinds = doc.slides.map((s) => s.kind);
      existing = doc.slides;
    }
  }

  const doc = await generateDraft({
    workspaceId: caller.workspaceId,
    brand: brandVoice(account),
    style: input.style,
    kinds,
    topic: input.topic,
    pillar: input.pillar,
    angle: input.angle,
    brief: input.brief,
    existing,
  });

  const pillarRow = input.pillar ? account.pillars.find((p) => p.name === input.pillar) : undefined;

  const data = {
    workspaceId: caller.workspaceId,
    accountId: account.id,
    style: input.style,
    archetype: input.archetype,
    topic: input.topic,
    pillarId: pillarRow?.id ?? null,
    brief: input.brief?.trim() || null,
    doc: doc as unknown as Prisma.InputJsonValue,
    caption: doc.caption,
    firstComment: doc.first,
    hashtags: doc.hashtags,
    status: "draft" as const,
    createdVia: caller.tokenId ? "agent" : "ui",
    apiTokenId: caller.tokenId,
  };

  const post = input.postId
    ? await prisma.post.update({ where: { id: input.postId }, data })
    : await prisma.post.create({ data });

  return { postId: post.id, doc, issues: describeIssues(validateDoc(input.style, doc)) };
}

export interface RevisePatch {
  /** Slide index (as a string key) → the slots to overwrite on that slide. */
  slides?: Record<string, Record<string, SlotValue>>;
  caption?: string;
  first?: string;
  hashtags?: string[];
}

/**
 * Apply a targeted patch. Deterministic and free: no model call, so fixing a
 * budget violation costs nothing and cannot introduce a new one elsewhere.
 */
export async function reviseDraft(
  caller: StudioCaller,
  postId: string,
  patch: RevisePatch,
): Promise<DraftResult> {
  const post = await ownedPost(caller, postId);
  assertAgentMutable(caller, post);

  const style = post.style as TemplateStyleId;
  const man = getManifest(style);
  const doc = post.doc as unknown as PostDoc;

  for (const [key, slots] of Object.entries(patch.slides ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= doc.slides.length) {
      throw new StudioError(
        "bad_request",
        `No slide at index ${key} — this post has ${doc.slides.length} slides (0-${doc.slides.length - 1}).`,
      );
    }

    const slide = doc.slides[index];
    const known = new Set((man.kinds[slide.kind]?.slots ?? []).map((s) => s.id));
    const unknown = Object.keys(slots).filter((id) => !known.has(id));
    if (unknown.length) {
      throw new StudioError(
        "bad_request",
        `Slide ${index + 1} (${slide.kind}) has no slot named ${unknown.join(", ")}. It has: ${[...known].join(", ")}`,
      );
    }

    // coerceFields re-imposes the manifest's shapes and budgets on the merge, so
    // an over-long value is trimmed rather than persisted and caught later.
    doc.slides[index] = { kind: slide.kind, f: coerceFields(style, slide.kind, { ...slide.f, ...slots }) };
  }

  if (patch.caption !== undefined) doc.caption = patch.caption;
  if (patch.first !== undefined) doc.first = patch.first;
  if (patch.hashtags !== undefined) {
    doc.hashtags = patch.hashtags
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .filter((t) => t.length > 1)
      .slice(0, man.postDelivery.hashtags?.max ?? 10);
  }

  await saveDoc(caller, postId, doc);
  return { postId, doc, issues: describeIssues(validateDoc(style, doc)) };
}

/** Persist a doc and its denormalised delivery fields. */
export async function saveDoc(
  caller: StudioCaller,
  postId: string,
  doc: PostDoc,
): Promise<void> {
  const post = await ownedPost(caller, postId);
  assertAgentMutable(caller, post);

  await prisma.post.update({
    where: { id: postId },
    data: {
      doc: doc as unknown as Prisma.InputJsonValue,
      caption: doc.caption,
      firstComment: doc.first,
      hashtags: doc.hashtags,
    },
  });
}

/** The clearance gate — the same check publishing enforces. */
export async function checkDraft(
  caller: StudioCaller,
  postId: string,
): Promise<{ cleared: boolean; issues: string[] }> {
  const post = await ownedPost(caller, postId);
  const issues = validateDoc(post.style as TemplateStyleId, post.doc as unknown as PostDoc);
  return { cleared: issues.length === 0, issues: describeIssues(issues) };
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/draft.itest.ts
```

Expected: PASS, 11 tests. If `coerceFields` is not exported from `lib/templates/doc.ts`, check the export list — it is (line 63).

- [ ] **Step 7: Rewire the server actions**

In `apps/web/src/app/actions/create.ts`, replace the private `ownedAccount`, `ownedPost` and `brandVoice` helpers and the bodies of the three draft actions. Keep every exported name and return type identical so no wizard component changes:

```ts
"use server";

import { requireAuth } from "@/lib/session";
import { uiCaller } from "@/lib/studio/types";
import {
  checkDraft,
  createDraft,
  saveDoc,
  type DraftResult,
} from "@/lib/studio/draft";
import { asStudioError } from "@/lib/studio/errors";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const e = asStudioError(err);
  console.error("[create action]", e.code, e.message);
  return { ok: false, error: e.message };
}

/** The caller a server action runs as: full scopes, no token. */
async function caller() {
  const auth = await requireAuth();
  return uiCaller(auth.workspaceId, auth.userId);
}

export interface DraftPayload {
  postId: string;
  doc: PostDoc;
}

export async function generateDraftAction(input: {
  accountId: string;
  style: TemplateStyleId;
  archetype: string;
  topic: string;
  pillar: string | null;
  postId?: string;
}): Promise<ActionResult<DraftPayload>> {
  try {
    const result: DraftResult = await createDraft(await caller(), input);
    return { ok: true, data: { postId: result.postId, doc: result.doc } };
  } catch (err) {
    return fail(err);
  }
}

export async function saveDraftAction(
  postId: string,
  doc: PostDoc,
): Promise<ActionResult<{ saved: true }>> {
  try {
    await saveDoc(await caller(), postId, doc);
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return fail(err);
  }
}

export interface ReviewCheck {
  cleared: boolean;
  issues: string[];
}

export async function checkDraftAction(postId: string): Promise<ActionResult<ReviewCheck>> {
  try {
    return { ok: true, data: await checkDraft(await caller(), postId) };
  } catch (err) {
    return fail(err);
  }
}
```

Leave the remaining actions in the file (`suggestTopicsAction`, `listAssetsAction`, `generateImageAction`, `previewScriptAction`, `synthesizeVoiceAction`) working as they are, but update them to use `caller()` and the shared `ownedAccount`/`ownedPost` from `@/lib/studio/posts` instead of the deleted private helpers.

- [ ] **Step 8: Typecheck**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: PASS. Failures here are the point of the task — every one is a call site that depended on a helper you moved.

- [ ] **Step 9: Verify the wizard in a browser before adding any MCP code**

Start the dev server via the preview tooling (never `pnpm dev` in a bare shell), then walk the Create wizard: pick an account, a style, a template, enter a topic, generate a draft, edit a slot, and open the Review screen. Confirm the draft generates, the edit persists on reload, and the clearance badge renders.

This is the gate the spec calls for: a UI regression must be caught here, against a small mechanical diff, not later when it could be blamed on the MCP route.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/studio apps/web/src/app/actions/create.ts
git commit -m "Extract the draft pipeline out of the server actions

The pipeline lived inside actions that read a cookie, so nothing but the
browser could reach it. It now takes an explicit caller, which is what lets
one code path serve both the wizard and an agent — the alternative was a
second implementation of budget enforcement and the claims guardrail, and
a divergence there is the bug you find in production.

The mutation rule lands with it: an agent may only touch drafts it created
and only while they are drafts, so a cron's retry cannot overwrite a post
the operator is reviewing."
```

---

### Task 5: Accounts and template description

**Files:**
- Create: `apps/web/src/lib/studio/accounts.ts`
- Create: `apps/web/src/lib/studio/templates.ts`
- Create: `apps/web/src/lib/studio/__tests__/templates.test.ts`
- Create: `apps/web/src/lib/studio/__tests__/accounts.itest.ts`

**Interfaces:**
- Consumes: `StudioCaller` (Task 2), `ownedAccount` (Task 4).
- Produces:
  - `interface AgentAccount { id, name, handle, locale, downloadUrl, pillars: string[], channels: {platform, enabled, linked}[], voices: {id,name,desc}[], claimsGuardrail, tones, readingLevel }`
  - `function listAccountsForAgent(caller: StudioCaller): Promise<AgentAccount[]>`
  - `interface SlotSpec { id, type, max, required, label, maxItems?, partMax? }`
  - `interface KindSpec { id, role, ground, name, desc, slots: SlotSpec[] }`
  - `interface TemplateSpec { style, label, aspect, canvas, noCaption, hasVoice, covers, interiors, end, slideLimits, defaultSequences, kinds: KindSpec[], postDelivery, aiContract }`
  - `function describeTemplates(style?: TemplateStyleId): TemplateSpec[]`

- [ ] **Step 1: Write the failing template test**

Create `apps/web/src/lib/studio/__tests__/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeTemplates } from "../templates";

/**
 * An agent picks style + archetype before it writes anything, and fills slots it
 * has never seen. If this description is wrong or incomplete, every draft it
 * produces fails validation for reasons it cannot diagnose.
 */
describe("describeTemplates", () => {
  it("describes all five styles when given no filter", () => {
    const specs = describeTemplates();
    expect(specs.map((s) => s.style).sort()).toEqual(
      ["carousel", "photo", "reel", "single", "story"].sort(),
    );
  });

  it("narrows to one style when asked", () => {
    const specs = describeTemplates("carousel");
    expect(specs).toHaveLength(1);
    expect(specs[0].style).toBe("carousel");
  });

  it("exposes every slot with the budget the validator enforces", () => {
    const [carousel] = describeTemplates("carousel");
    const knockout = carousel.kinds.find((k) => k.id === "1a-knockout");
    expect(knockout).toBeDefined();

    const hook = knockout!.slots.find((s) => s.id === "hook");
    expect(hook).toMatchObject({ type: "text", required: true, max: 42 });
  });

  it("gives a default sequence for every cover archetype, so a draft can be built blind", () => {
    for (const spec of describeTemplates()) {
      for (const cover of spec.covers) {
        const sequence = spec.defaultSequences[cover];
        expect(sequence, `${spec.style}/${cover}`).toBeDefined();
        expect(sequence.length).toBeGreaterThan(0);
        // Every kind in the sequence must be a kind the agent was told about.
        for (const kind of sequence) {
          expect(spec.kinds.map((k) => k.id)).toContain(kind);
        }
      }
    }
  });

  it("flags which styles carry voice and which carry no caption", () => {
    const byStyle = Object.fromEntries(describeTemplates().map((s) => [s.style, s]));
    expect(byStyle.reel.hasVoice).toBe(true);
    expect(byStyle.story.noCaption).toBe(true);
    expect(byStyle.carousel.noCaption).toBe(false);
  });

  it("reports the slide-count bounds so an agent does not propose an illegal sequence", () => {
    const [carousel] = describeTemplates("carousel");
    expect(carousel.slideLimits.min).toBeGreaterThan(0);
    expect(carousel.slideLimits.max).toBeGreaterThanOrEqual(carousel.slideLimits.min);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run src/lib/studio/__tests__/templates.test.ts
```

Expected: FAIL — `Failed to resolve import "../templates"`.

- [ ] **Step 3: Write `lib/studio/templates.ts`**

Create `apps/web/src/lib/studio/templates.ts`:

```ts
import { MANIFESTS, SLIDE_LIMITS, getManifest } from "@/lib/templates/manifests";
import type { TemplateManifest, TemplateStyleId } from "@/lib/templates/types";

/**
 * The manifests, flattened for an agent.
 *
 * Deliberately not `server-only`: this reads frozen constants, touches no
 * database and holds no secret, so the token settings UI can render it too.
 *
 * `defaultSequence` is a function on the manifest; an agent cannot call it, so
 * every cover archetype's sequence is materialised here instead.
 */

export interface SlotSpec {
  id: string;
  type: string;
  /** Character budget. 0 means unbounded (image slots, URLs). */
  max: number;
  required: boolean;
  label: string;
  maxItems?: number;
  partMax?: { lead: number; detail: number };
}

export interface KindSpec {
  id: string;
  role: string;
  ground: string;
  name: string;
  desc: string;
  slots: SlotSpec[];
}

export interface TemplateSpec {
  style: TemplateStyleId;
  label: string;
  aspect: string;
  canvas: { width: number; height: number };
  noCaption: boolean;
  hasVoice: boolean;
  covers: string[];
  interiors: string[];
  end: string | null;
  slideLimits: { min: number; max: number };
  defaultSequences: Record<string, string[]>;
  kinds: KindSpec[];
  postDelivery: Record<string, { max: number; required: boolean; role: string }>;
  aiContract: string;
}

function describe(man: TemplateManifest): TemplateSpec {
  const defaultSequences: Record<string, string[]> = {};
  for (const cover of man.cover) {
    defaultSequences[cover] = man.defaultSequence(cover);
  }

  return {
    style: man.id,
    label: man.label,
    aspect: man.aspect,
    canvas: man.canvas,
    noCaption: !!man.noCaption,
    hasVoice: !!man.voice,
    covers: man.cover,
    interiors: man.interior,
    end: man.end,
    slideLimits: SLIDE_LIMITS[man.id],
    defaultSequences,
    kinds: Object.entries(man.kinds).map(([id, k]) => ({
      id,
      role: k.role,
      ground: k.ground,
      name: k.name,
      desc: k.desc,
      slots: k.slots.map((s) => ({
        id: s.id,
        type: s.type,
        max: s.max,
        required: s.required,
        label: s.label,
        ...(s.maxItems !== undefined ? { maxItems: s.maxItems } : {}),
        ...(s.partMax ? { partMax: s.partMax } : {}),
      })),
    })),
    postDelivery: man.postDelivery,
    aiContract: man.aiContract,
  };
}

export function describeTemplates(style?: TemplateStyleId): TemplateSpec[] {
  if (style) return [describe(getManifest(style))];
  return Object.values(MANIFESTS).map(describe);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run src/lib/studio/__tests__/templates.test.ts
```

Expected: PASS, 6 tests. If the `hook` budget assertion fails, read the real value from `manifests.ts` and correct the test — the manifest is frozen and authoritative.

- [ ] **Step 5: Write the failing accounts test**

Create `apps/web/src/lib/studio/__tests__/accounts.itest.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listAccountsForAgent } from "../accounts";
import { withTestWorkspace } from "./helpers";

/**
 * This is the agent's first call every morning: everything it plans depends on
 * reading the right locale off the right account.
 */
describe("listAccountsForAgent", () => {
  it("reports the locale, pillars and voices an agent plans against", () =>
    withTestWorkspace(async (f) => {
      await prisma.brandAccount.update({
        where: { id: f.accountId },
        data: {
          locale: "pt_BR",
          downloadUrl: "https://example.test/app",
          pillars: { create: [{ name: "Nutrição", position: 0 }] },
        },
      });

      const [account] = await listAccountsForAgent(f.caller);
      expect(account).toMatchObject({
        id: f.accountId,
        locale: "pt_BR",
        downloadUrl: "https://example.test/app",
        claimsGuardrail: true,
      });
      expect(account.pillars).toContain("Nutrição");
      expect(account.voices.length).toBeGreaterThan(0);
      expect(account.voices[0]).toHaveProperty("id");
    }));

  it("never returns another workspace's accounts", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        const rows = await listAccountsForAgent(f.caller);
        expect(rows.map((r) => r.id)).toEqual([f.accountId]);
        expect(rows.map((r) => r.id)).not.toContain(other.accountId);
      }),
    ));

  it("reports whether a channel is linked, so the agent knows the post is publishable", () =>
    withTestWorkspace(async (f) => {
      await prisma.channel.create({
        data: {
          accountId: f.accountId,
          platform: "instagram",
          enabled: true,
          externalId: null,
        },
      });

      const [account] = await listAccountsForAgent(f.caller);
      expect(account.channels).toEqual([
        { platform: "instagram", enabled: true, linked: false },
      ]);
    }));
});
```

**Before running:** check `model Channel` and `model Pillar` in `schema.prisma` for their real required fields and fix the creates to match.

- [ ] **Step 6: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/accounts.itest.ts
```

Expected: FAIL — `Failed to resolve import "../accounts"`.

- [ ] **Step 7: Write `lib/studio/accounts.ts`**

Create `apps/web/src/lib/studio/accounts.ts`:

```ts
import "server-only";
import { listAccounts } from "@/lib/workspace";
import { VOICES } from "@/lib/ai/voices";
import type { StudioCaller } from "./types";

/**
 * Brand accounts as an agent needs them.
 *
 * `locale` is the field everything downstream turns on: it decides the language
 * the copy is written in and, through the brief, which culture the agent should
 * research. Channels report `linked` rather than the external id — an agent has
 * no use for the id and no business seeing it.
 */

export interface AgentAccount {
  id: string;
  name: string;
  handle: string;
  /** "en" | "pt_BR" — drives language and cultural research. */
  locale: string;
  downloadUrl: string | null;
  claimsGuardrail: boolean;
  tones: string[];
  readingLevel: string;
  voiceDescription: string;
  pillars: string[];
  channels: { platform: string; enabled: boolean; linked: boolean }[];
  voices: { id: string; name: string; desc: string }[];
}

export async function listAccountsForAgent(caller: StudioCaller): Promise<AgentAccount[]> {
  const accounts = await listAccounts(caller.workspaceId);

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    handle: a.handle,
    locale: a.locale,
    downloadUrl: a.downloadUrl,
    claimsGuardrail: a.claimsGuardrail,
    tones: a.tones,
    readingLevel: a.readingLevel,
    voiceDescription: a.voiceDescription,
    pillars: a.pillars.map((p) => p.name),
    channels: a.channels.map((c) => ({
      platform: c.platform,
      enabled: c.enabled,
      linked: !!c.externalId,
    })),
    voices: VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc })),
  }));
}
```

- [ ] **Step 8: Run both tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/accounts.itest.ts && pnpm exec vitest run src/lib/studio/__tests__/templates.test.ts
```

Expected: PASS for both.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/studio
git commit -m "Describe accounts and templates for an agent

An agent picks a style and archetype and fills slots it has never seen, so
it needs the manifests as data — including each cover's default sequence,
which is a function on the manifest and therefore invisible over the wire.

Channels report whether they are linked rather than exposing the external
id: the agent needs to know a post is publishable, not where to publish it."
```

---

### Task 6: Rolling-24h spend and draft caps

**Files:**
- Create: `apps/web/src/lib/studio/caps.ts`
- Create: `apps/web/src/lib/studio/__tests__/caps.itest.ts`

**Interfaces:**
- Consumes: `StudioCaller`, `StudioError` (Task 2); `ApiToken`, `Job.costCents`, `Post.apiTokenId` (Task 1).
- Produces:
  - `const IMAGE_COST_CENTS: number`, `const VOICE_COST_CENTS: number`
  - `interface CapUsage { draftsUsed: number; draftCap: number; centsUsed: number; centsCap: number }`
  - `function capUsage(caller: StudioCaller): Promise<CapUsage | null>` — `null` for UI callers
  - `function assertDraftCap(caller: StudioCaller): Promise<void>`
  - `function assertSpendCap(caller: StudioCaller, addCents: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/studio/__tests__/caps.itest.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assertDraftCap, assertSpendCap, capUsage } from "../caps";
import { mintToken, verifyToken } from "../tokens";
import { withTestWorkspace } from "./helpers";

/**
 * These caps are the only thing between an unattended cron and a real bill.
 * The window is deliberately rolling rather than per calendar day: no timezone
 * to decide, and a run that straddles midnight cannot reset its own budget.
 */
const DAY = 24 * 60 * 60 * 1000;

async function agentFor(f: { workspaceId: string; userId: string }, over: Partial<{ dailyCapCents: number; dailyDraftCap: number }> = {}) {
  const { token } = await mintToken({
    workspaceId: f.workspaceId,
    userId: f.userId,
    name: "Hermes",
    scopes: ["draft", "media"],
    dailyCapCents: over.dailyCapCents ?? 100,
    dailyDraftCap: over.dailyDraftCap ?? 3,
  });
  return verifyToken(token);
}

/** A post attributed to a token, created `agoMs` in the past. */
async function seedPost(f: { workspaceId: string; accountId: string }, tokenId: string, agoMs: number) {
  return prisma.post.create({
    data: {
      workspaceId: f.workspaceId,
      accountId: f.accountId,
      style: "carousel",
      archetype: "1a-knockout",
      doc: { slides: [], caption: "", first: "", hashtags: [], linkSticker: "", mention: "" },
      createdVia: "agent",
      apiTokenId: tokenId,
      createdAt: new Date(Date.now() - agoMs),
    },
    select: { id: true },
  });
}

async function seedJob(
  f: { workspaceId: string },
  postId: string,
  tokenId: string,
  costCents: number,
  agoMs: number,
) {
  await prisma.job.create({
    data: {
      workspaceId: f.workspaceId,
      postId,
      apiTokenId: tokenId,
      kind: "media",
      state: "done",
      costCents,
      createdAt: new Date(Date.now() - agoMs),
    },
  });
}

describe("assertDraftCap", () => {
  it("allows a call under the cap and refuses the one that would exceed it", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyDraftCap: 2 });

      await expect(assertDraftCap(agent)).resolves.toBeUndefined();
      await seedPost(f, agent.tokenId!, 0);
      await expect(assertDraftCap(agent)).resolves.toBeUndefined();
      await seedPost(f, agent.tokenId!, 0);
      await expect(assertDraftCap(agent)).rejects.toMatchObject({ code: "cap_reached" });
    }));

  it("ignores drafts older than the rolling window", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyDraftCap: 1 });
      await seedPost(f, agent.tokenId!, DAY + 60_000);
      await expect(assertDraftCap(agent)).resolves.toBeUndefined();
    }));

  it("counts each token separately", () =>
    withTestWorkspace(async (f) => {
      const a = await agentFor(f, { dailyDraftCap: 1 });
      const b = await agentFor(f, { dailyDraftCap: 1 });
      await seedPost(f, a.tokenId!, 0);

      await expect(assertDraftCap(a)).rejects.toMatchObject({ code: "cap_reached" });
      await expect(assertDraftCap(b)).resolves.toBeUndefined();
    }));

  it("never caps a UI caller", () =>
    withTestWorkspace(async (f) => {
      await expect(assertDraftCap(f.caller)).resolves.toBeUndefined();
      await expect(assertSpendCap(f.caller, 1_000_000)).resolves.toBeUndefined();
      await expect(capUsage(f.caller)).resolves.toBeNull();
    }));
});

describe("assertSpendCap", () => {
  it("refuses a call whose projected cost would breach the cap", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyCapCents: 100 });
      const post = await seedPost(f, agent.tokenId!, 0);
      await seedJob(f, post.id, agent.tokenId!, 90, 0);

      await expect(assertSpendCap(agent, 5)).resolves.toBeUndefined();
      await expect(assertSpendCap(agent, 20)).rejects.toMatchObject({
        code: "cap_reached",
        retryable: false,
      });
    }));

  it("counts spend from jobs, so repeated media on one old post still accrues", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyCapCents: 100 });
      // A post created two days ago — outside the draft window entirely.
      const post = await seedPost(f, agent.tokenId!, 2 * DAY);
      await seedJob(f, post.id, agent.tokenId!, 95, 0);

      await expect(assertSpendCap(agent, 20)).rejects.toMatchObject({ code: "cap_reached" });
    }));

  it("ignores spend older than the rolling window", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyCapCents: 100 });
      const post = await seedPost(f, agent.tokenId!, 0);
      await seedJob(f, post.id, agent.tokenId!, 500, DAY + 60_000);

      await expect(assertSpendCap(agent, 20)).resolves.toBeUndefined();
    }));

  it("names the numbers in the message, so the agent reports rather than retries", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyCapCents: 100 });
      const post = await seedPost(f, agent.tokenId!, 0);
      await seedJob(f, post.id, agent.tokenId!, 100, 0);

      await expect(assertSpendCap(agent, 10)).rejects.toThrow(/100/);
    }));
});

describe("capUsage", () => {
  it("reports both budgets for an agent caller", () =>
    withTestWorkspace(async (f) => {
      const agent = await agentFor(f, { dailyCapCents: 250, dailyDraftCap: 4 });
      const post = await seedPost(f, agent.tokenId!, 0);
      await seedJob(f, post.id, agent.tokenId!, 40, 0);

      await expect(capUsage(agent)).resolves.toEqual({
        draftsUsed: 1,
        draftCap: 4,
        centsUsed: 40,
        centsCap: 250,
      });
    }));
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/caps.itest.ts
```

Expected: FAIL — `Failed to resolve import "../caps"`.

- [ ] **Step 3: Write `lib/studio/caps.ts`**

Create `apps/web/src/lib/studio/caps.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/db";
import { StudioError } from "./errors";
import type { StudioCaller } from "./types";

/**
 * Per-token rolling-24h ceilings.
 *
 * An unattended cron with fal.ai and ElevenLabs access can spend real money in a
 * loop, and the loop is the likely failure — an agent that misreads an error
 * retries. Both caps are per token rather than per workspace so a leaked
 * credential has a bounded daily blast radius and revoking one client does not
 * disturb the other.
 *
 * The window is rolling from the time of the call: no timezone to choose, and a
 * run straddling midnight cannot reset its own budget.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Rough per-call provider costs, used to project a spend before making it. */
export const IMAGE_COST_CENTS = 5;
export const VOICE_COST_CENTS = 10;

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MS);
}

export interface CapUsage {
  draftsUsed: number;
  draftCap: number;
  centsUsed: number;
  centsCap: number;
}

async function limits(tokenId: string) {
  const row = await prisma.apiToken.findUnique({
    where: { id: tokenId },
    select: { dailyCapCents: true, dailyDraftCap: true },
  });
  if (!row) throw new StudioError("forbidden", "Invalid or expired token.");
  return row;
}

/** Null for UI callers — the operator is not on a budget. */
export async function capUsage(caller: StudioCaller): Promise<CapUsage | null> {
  if (!caller.tokenId) return null;
  const { dailyCapCents, dailyDraftCap } = await limits(caller.tokenId);
  const since = windowStart();

  const [draftsUsed, spend] = await Promise.all([
    prisma.post.count({ where: { apiTokenId: caller.tokenId, createdAt: { gte: since } } }),
    prisma.job.aggregate({
      where: { apiTokenId: caller.tokenId, createdAt: { gte: since } },
      _sum: { costCents: true },
    }),
  ]);

  return {
    draftsUsed,
    draftCap: dailyDraftCap,
    centsUsed: spend._sum.costCents ?? 0,
    centsCap: dailyCapCents,
  };
}

/**
 * A morning run wants one to three posts, not forty. A runaway loop hits this
 * within minutes rather than after a night of generation.
 */
export async function assertDraftCap(caller: StudioCaller): Promise<void> {
  const usage = await capUsage(caller);
  if (!usage) return;

  if (usage.draftsUsed >= usage.draftCap) {
    throw new StudioError(
      "cap_reached",
      `This token has created ${usage.draftsUsed} drafts in the last 24 hours and its limit is ${usage.draftCap}. Stop and report this rather than retrying — the limit resets as the oldest draft ages out.`,
    );
  }
}

/** Called before spending, with the projected cost of the call. */
export async function assertSpendCap(caller: StudioCaller, addCents: number): Promise<void> {
  const usage = await capUsage(caller);
  if (!usage) return;

  if (usage.centsUsed + addCents > usage.centsCap) {
    throw new StudioError(
      "cap_reached",
      `This call would spend ${addCents}¢, taking the last 24 hours to ${
        usage.centsUsed + addCents
      }¢ against a limit of ${usage.centsCap}¢. Stop and report this rather than retrying.`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/caps.itest.ts
```

Expected: PASS, 9 tests. If the `seedPost` helper fails on a required column, fix it against `schema.prisma`.

- [ ] **Step 5: Enforce the draft cap in `createDraft`**

In `apps/web/src/lib/studio/draft.ts`, add the import and the check. The cap is asserted **after** argument validation and **before** the OpenAI call, so a bad-argument call does not consume budget and a capped call does not spend:

```ts
import { assertDraftCap } from "./caps";
```

Then in `createDraft`, immediately before `const doc = await generateDraft({`:

```ts
  // After validation, before spending: a malformed call must not consume budget.
  if (!input.postId) await assertDraftCap(caller);
```

Regeneration (`input.postId` set) is deliberately exempt: it replaces a draft the token already paid for, and counting it would punish an agent for fixing its own output.

- [ ] **Step 6: Add the regression test for that wiring**

Append to `apps/web/src/lib/studio/__tests__/draft.itest.ts`:

```ts
describe("createDraft and the draft cap", () => {
  it("refuses a new draft once the token's rolling-24h cap is reached", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
        dailyDraftCap: 1,
      });
      const agent = await verifyToken(token);
      const base = {
        accountId: f.accountId,
        style: "carousel" as const,
        archetype: "1a-knockout",
        topic: "t",
      };

      const first = await createDraft(agent, base);
      await expect(createDraft(agent, base)).rejects.toMatchObject({ code: "cap_reached" });

      // Regenerating the draft it already paid for stays allowed.
      await expect(createDraft(agent, { ...base, postId: first.postId })).resolves.toMatchObject({
        postId: first.postId,
      });
    }));

  it("rejects a bad argument without consuming budget", () =>
    withTestWorkspace(async (f) => {
      await seedOpenAiCredential(f.workspaceId);
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
        dailyDraftCap: 1,
      });
      const agent = await verifyToken(token);

      await expect(
        createDraft(agent, {
          accountId: f.accountId,
          style: "carousel",
          archetype: "nope",
          topic: "t",
        }),
      ).rejects.toMatchObject({ code: "bad_request" });

      // The failed call must not have counted against the cap.
      await expect(
        createDraft(agent, {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "t",
        }),
      ).resolves.toHaveProperty("postId");
    }));
});
```

- [ ] **Step 7: Run the draft suite**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/draft.itest.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/studio
git commit -m "Cap agent spend and draft count over a rolling 24 hours

The likely failure of an unattended cron is a loop: an agent that misreads
an error retries, and every retry can call fal.ai. Spend is summed from Job
rows rather than Post.costCents, because a loop hammering start_media on one
old post would otherwise fall outside a creation-time window and spend
without limit.

Regeneration is exempt from the draft cap — it replaces a draft the token
already paid for, and counting it would punish an agent for fixing itself."
```

---

### Task 7: Media and render jobs

**Files:**
- Create: `apps/web/src/lib/studio/media.ts`
- Create: `apps/web/src/lib/studio/__tests__/media.itest.ts`

**Interfaces:**
- Consumes: `StudioCaller`, `StudioError` (Task 2); `ownedPost`, `assertAgentMutable` (Task 4); `assertSpendCap`, `IMAGE_COST_CENTS`, `VOICE_COST_CENTS` (Task 6).
- Produces:
  - `interface ImageSlotRequest { slideIndex: number; slotId: string; prompt: string }`
  - `interface StartMediaInput { postId: string; images?: "auto" | ImageSlotRequest[]; voice?: { voiceId: string; narration: string }; force?: boolean }`
  - `function startMedia(caller: StudioCaller, input: StartMediaInput): Promise<{ jobId: string }>`
  - `function startRenderJob(caller: StudioCaller, postId: string): Promise<{ jobId: string }>`
  - `interface JobView { jobId: string; kind: string; state: string; done: number; total: number; results: unknown[]; errors: unknown[] }`
  - `function jobStatus(caller: StudioCaller, jobId: string): Promise<JobView>`
  - `function plannedImageSlots(style, doc, topic, brandName, force): ImageSlotRequest[]`

- [ ] **Step 1: Read the three provider entry points you are wrapping**

Read the signatures you must call exactly:
- `generateImage({ workspaceId, accountId, prompt, style }): Promise<{ id, name, url, ai, kind }>` — `apps/web/src/lib/ai/fal.ts:78`
- `assembleScript(style, doc, narration): string[]` and `synthesizeVoice({ workspaceId, accountId, postId, voiceId, lines }): Promise<{ assetId, url, estimatedSeconds }>` — `apps/web/src/lib/ai/voice.ts:28,80`
- `suggestImagePrompt({ style, slide, topic, brand }): string` — `apps/web/src/lib/templates/image-prompt.ts:83`
- `ensureRendered(postId): Promise<{ status: "ready", mediaUrls } | { status: "rendering", jobId }>` and `renderStatus(postId)` — `apps/web/src/lib/render.ts:191,214`

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/studio/__tests__/media.itest.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { jobStatus, plannedImageSlots, startMedia } from "../media";
import { mintToken, verifyToken } from "../tokens";
import { withTestWorkspace } from "./helpers";
import { buildEmptyDoc } from "@/lib/templates/doc";
import type { PostDoc } from "@/lib/templates/types";

/**
 * The providers are stubbed; the job lifecycle, per-slot idempotency, spend
 * accounting and partial-failure reporting all run for real. Those are the parts
 * that decide whether a retry costs money twice.
 */
vi.mock("@/lib/ai/fal", () => ({
  generateImage: vi.fn(async ({ prompt }: { prompt: string }) => {
    if (prompt.includes("BOOM")) throw new Error("fal.ai generation failed");
    return { id: `asset-${prompt.slice(0, 6)}`, name: "generated.png", url: "/media/x.png", ai: true, kind: "photo" };
  }),
}));

vi.mock("@/lib/ai/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/voice")>();
  return {
    ...actual,
    synthesizeVoice: vi.fn(async () => ({ assetId: "voice-asset", url: "/media/v.mp3", estimatedSeconds: 22 })),
  };
});

/** Wait for the detached background task to finish the job. */
async function settle(jobId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (job.state === "done" || job.state === "failed") return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Job ${jobId} never settled`);
}

async function seedReel(f: { workspaceId: string; accountId: string }, tokenId: string | null) {
  const doc = buildEmptyDoc("reel", "hook");
  const post = await prisma.post.create({
    data: {
      workspaceId: f.workspaceId,
      accountId: f.accountId,
      style: "reel",
      archetype: "hook",
      topic: "Protein first",
      doc: doc as never,
      createdVia: tokenId ? "agent" : "ui",
      apiTokenId: tokenId,
    },
    select: { id: true },
  });
  return post.id;
}

beforeEach(() => vi.clearAllMocks();

describe("plannedImageSlots", () => {
  it("plans one request per empty image slot, with a derived prompt", () => {
    const doc = buildEmptyDoc("reel", "hook") as PostDoc;
    const planned = plannedImageSlots("reel", doc, "Protein first", "Gastric IQ", false);

    expect(planned.length).toBeGreaterThan(0);
    for (const p of planned) {
      expect(p.prompt.trim().length).toBeGreaterThan(0);
      expect(p.slotId).toBeTruthy();
    }
  });

  it("skips a slot that already holds an image, unless forced", () => {
    const doc = buildEmptyDoc("reel", "hook") as PostDoc;
    const first = plannedImageSlots("reel", doc, "t", "b", false)[0];
    doc.slides[first.slideIndex].f[first.slotId] = { id: "existing", name: "already.png", url: "/media/a.png" };

    const after = plannedImageSlots("reel", doc, "t", "b", false);
    expect(after.some((p) => p.slideIndex === first.slideIndex && p.slotId === first.slotId)).toBe(false);

    const forced = plannedImageSlots("reel", doc, "t", "b", true);
    expect(forced.some((p) => p.slideIndex === first.slideIndex && p.slotId === first.slotId)).toBe(true);
  });
});

describe("startMedia", () => {
  it("fills every empty image slot and writes the assets into the doc", () =>
    withTestWorkspace(async (f) => {
      const postId = await seedReel(f, null);
      const { jobId } = await startMedia(f.caller, { postId, images: "auto" });

      const job = await settle(jobId);
      expect(job.state).toBe("done");
      expect(job.done).toBe(job.total);
      expect(job.total).toBeGreaterThan(0);

      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      const doc = row.doc as unknown as PostDoc;
      const filled = doc.slides.flatMap((s) =>
        Object.values(s.f).filter((v) => !!v && typeof v === "object" && "id" in (v as object)),
      );
      expect(filled.length).toBe(job.total);
    }));

  it("is idempotent per slot: a second run with no force spends nothing", () =>
    withTestWorkspace(async (f) => {
      const { generateImage } = await import("@/lib/ai/fal");
      const postId = await seedReel(f, null);

      const first = await startMedia(f.caller, { postId, images: "auto" });
      const firstJob = await settle(first.jobId);
      const calls = vi.mocked(generateImage).mock.calls.length;
      expect(calls).toBe(firstJob.total);

      const second = await startMedia(f.caller, { postId, images: "auto" });
      const secondJob = await settle(second.jobId);
      expect(secondJob.total).toBe(0);
      expect(secondJob.costCents).toBe(0);
      expect(vi.mocked(generateImage).mock.calls.length).toBe(calls);
    }));

  it("reports a single slot failure in errors and still finishes the rest", () =>
    withTestWorkspace(async (f) => {
      const postId = await seedReel(f, null);
      const doc = (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .doc as unknown as PostDoc;
      const planned = plannedImageSlots("reel", doc, "t", "b", false);
      expect(planned.length).toBeGreaterThan(1);

      const { jobId } = await startMedia(f.caller, {
        postId,
        images: planned.map((p, i) => ({ ...p, prompt: i === 0 ? "BOOM bad prompt" : "a calm still" })),
      });

      const job = await settle(jobId);
      expect(job.state).toBe("done");
      expect(job.errors as unknown[]).toHaveLength(1);
      expect(job.done).toBe(job.total - 1);
      // Only successful slots are billed.
      expect(job.costCents).toBeGreaterThan(0);
    }));

  it("records what it spent, so the cap can see it", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["media"],
        dailyCapCents: 10_000,
      });
      const agent = await verifyToken(token);
      const postId = await seedReel(f, agent.tokenId);

      const { jobId } = await startMedia(agent, { postId, images: "auto" });
      const job = await settle(jobId);
      expect(job.costCents).toBeGreaterThan(0);
      expect(job.apiTokenId).toBe(agent.tokenId);
    }));

  it("refuses before spending when the projected cost breaches the cap", () =>
    withTestWorkspace(async (f) => {
      const { generateImage } = await import("@/lib/ai/fal");
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["media"],
        dailyCapCents: 1,
      });
      const agent = await verifyToken(token);
      const postId = await seedReel(f, agent.tokenId);

      await expect(startMedia(agent, { postId, images: "auto" })).rejects.toMatchObject({
        code: "cap_reached",
      });
      expect(generateImage).not.toHaveBeenCalled();
      // No job row is left behind for a call that never ran.
      expect(await prisma.job.count({ where: { postId } })).toBe(0);
    }));

  it("refuses voice on a style with no narration surface", () =>
    withTestWorkspace(async (f) => {
      const doc = buildEmptyDoc("carousel", "1a-knockout");
      const post = await prisma.post.create({
        data: {
          workspaceId: f.workspaceId,
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          doc: doc as never,
        },
        select: { id: true },
      });

      await expect(
        startMedia(f.caller, {
          postId: post.id,
          images: [],
          voice: { voiceId: "9BWtsMINqrJLrRacOk9x", narration: "verbatim" },
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));

  it("synthesizes voice on a reel and attaches it to the post", () =>
    withTestWorkspace(async (f) => {
      const postId = await seedReel(f, null);
      const { jobId } = await startMedia(f.caller, {
        postId,
        images: [],
        voice: { voiceId: "9BWtsMINqrJLrRacOk9x", narration: "verbatim" },
      });

      const job = await settle(jobId);
      expect(job.state).toBe("done");

      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      expect(row.voiceAssetId).toBe("voice-asset");
      expect(row.voiceId).toBe("9BWtsMINqrJLrRacOk9x");
    }));

  it("will not touch a post another token created", () =>
    withTestWorkspace(async (f) => {
      const a = await verifyToken(
        (await mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "A", scopes: ["media"] })).token,
      );
      const b = await verifyToken(
        (await mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "B", scopes: ["media"] })).token,
      );
      const postId = await seedReel(f, a.tokenId);

      await expect(startMedia(b, { postId, images: "auto" })).rejects.toMatchObject({
        code: "forbidden",
      });
    }));
});

describe("jobStatus", () => {
  it("returns progress for a job in this workspace and hides one from another", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        const postId = await seedReel(f, null);
        const { jobId } = await startMedia(f.caller, { postId, images: "auto" });
        await settle(jobId);

        const view = await jobStatus(f.caller, jobId);
        expect(view).toMatchObject({ jobId, kind: "media", state: "done" });

        await expect(jobStatus(other.caller, jobId)).rejects.toMatchObject({ code: "not_found" });
      }),
    ));

  it("reports a job stuck past the staleness window as failed", () =>
    withTestWorkspace(async (f) => {
      const postId = await seedReel(f, null);
      const stale = await prisma.job.create({
        data: {
          workspaceId: f.workspaceId,
          postId,
          kind: "media",
          state: "running",
          total: 3,
          done: 1,
          startedAt: new Date(Date.now() - 11 * 60 * 1000),
        },
        select: { id: true },
      });

      const view = await jobStatus(f.caller, stale.id);
      expect(view.state).toBe("failed");
      expect(JSON.stringify(view.errors)).toMatch(/restart|lost/i);
    }));
});
```

Note the deliberate syntax error in `beforeEach` above — `beforeEach(() => vi.clearAllMocks();` is missing its closing paren. Fix it to `beforeEach(() => vi.clearAllMocks());` when you create the file.

- [ ] **Step 3: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/media.itest.ts
```

Expected: FAIL — `Failed to resolve import "../media"`.

- [ ] **Step 4: Write `lib/studio/media.ts`**

Create `apps/web/src/lib/studio/media.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/db";
import { generateImage } from "@/lib/ai/fal";
import { assembleScript, synthesizeVoice } from "@/lib/ai/voice";
import { ensureRendered, renderStatus } from "@/lib/render";
import { getManifest } from "@/lib/templates/manifests";
import { suggestImagePrompt } from "@/lib/templates/image-prompt";
import { isImageValue, type PostDoc, type TemplateStyleId } from "@/lib/templates/types";
import type { Narration } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { IMAGE_COST_CENTS, VOICE_COST_CENTS, assertSpendCap } from "./caps";
import { StudioError } from "./errors";
import { assertAgentMutable, ownedPost } from "./posts";
import type { StudioCaller } from "./types";

/**
 * Slow provider work, behind a server-minted handle the agent polls.
 *
 * fal.ai and ElevenLabs take 20-120s, so a blocking tool call risks a client
 * timeout — and no transport fixes that. Webhooks would only serve Hermes, which
 * is a server; Claude cannot receive one. So this generalises the pattern the app
 * already uses for renders, which is also what protocol 2026-07-28 prescribes:
 * server-minted handles passed back as ordinary tool arguments.
 *
 * The job runs as a detached task. The app is a long-lived Node container on
 * dokploy, not serverless, so the task outlives the response; a restart is
 * caught by the staleness check in jobStatus rather than leaving a job pending
 * forever.
 */

const STALE_AFTER_MS = 10 * 60 * 1000;

export interface ImageSlotRequest {
  slideIndex: number;
  slotId: string;
  prompt: string;
}

export interface StartMediaInput {
  postId: string;
  /** "auto" derives a prompt per empty slot; an array targets exact slots. */
  images?: "auto" | ImageSlotRequest[];
  voice?: { voiceId: string; narration: string };
  /** Regenerate slots that already hold an image. Costs money again. */
  force?: boolean;
}

/**
 * Which image slots need filling, and what to prompt for each.
 *
 * A slot already holding an image is skipped unless forced — this is what stops
 * a retried job re-billing five images.
 */
export function plannedImageSlots(
  style: TemplateStyleId,
  doc: PostDoc,
  topic: string,
  brandName: string,
  force: boolean,
): ImageSlotRequest[] {
  const man = getManifest(style);
  const planned: ImageSlotRequest[] = [];

  doc.slides.forEach((slide, slideIndex) => {
    for (const slot of man.kinds[slide.kind]?.slots ?? []) {
      if (slot.type !== "image") continue;
      if (!force && isImageValue(slide.f[slot.id])) continue;

      const prompt = suggestImagePrompt({ style, slide, topic, brand: brandName });
      if (!prompt.trim()) continue;
      planned.push({ slideIndex, slotId: slot.id, prompt });
    }
  });

  return planned;
}

interface MediaPlan {
  images: ImageSlotRequest[];
  voice: { voiceId: string; narration: Narration } | null;
}

export async function startMedia(
  caller: StudioCaller,
  input: StartMediaInput,
): Promise<{ jobId: string }> {
  const post = await ownedPost(caller, input.postId);
  assertAgentMutable(caller, post);

  const style = post.style as TemplateStyleId;
  const man = getManifest(style);
  const doc = post.doc as unknown as PostDoc;

  if (input.voice && !man.voice) {
    throw new StudioError(
      "bad_request",
      `The ${style} template carries no narration — voice is only available on reel and story.`,
    );
  }

  const requested = input.images ?? "auto";
  const images =
    requested === "auto"
      ? plannedImageSlots(style, doc, post.topic ?? "", post.account.name, !!input.force)
      : requested;

  // Validate explicit targets before spending anything on the valid ones.
  if (requested !== "auto") {
    for (const req of images) {
      const slide = doc.slides[req.slideIndex];
      if (!slide) {
        throw new StudioError(
          "bad_request",
          `No slide at index ${req.slideIndex} — this post has ${doc.slides.length} slides.`,
        );
      }
      const slot = (man.kinds[slide.kind]?.slots ?? []).find((s) => s.id === req.slotId);
      if (!slot || slot.type !== "image") {
        throw new StudioError(
          "bad_request",
          `Slide ${req.slideIndex + 1} (${slide.kind}) has no image slot named "${req.slotId}".`,
        );
      }
      if (!req.prompt.trim()) {
        throw new StudioError("bad_request", `Give slot "${req.slotId}" a prompt.`);
      }
    }
  }

  const plan: MediaPlan = {
    images,
    voice: input.voice
      ? { voiceId: input.voice.voiceId, narration: input.voice.narration as Narration }
      : null,
  };

  const projected =
    plan.images.length * IMAGE_COST_CENTS + (plan.voice ? VOICE_COST_CENTS : 0);
  // Before the job row exists: a refused call must leave nothing behind.
  await assertSpendCap(caller, projected);

  const total = plan.images.length + (plan.voice ? 1 : 0);
  const job = await prisma.job.create({
    data: {
      workspaceId: caller.workspaceId,
      postId: post.id,
      apiTokenId: caller.tokenId,
      kind: "media",
      state: total === 0 ? "done" : "queued",
      total,
    },
    select: { id: true },
  });

  if (total > 0) void runMediaJob(job.id, plan).catch(() => {});
  return { jobId: job.id };
}

/**
 * Run one media job. Never throws — every failure is recorded on the job so the
 * polling agent sees a per-slot reason instead of an opaque failure.
 */
export async function runMediaJob(jobId: string, plan: MediaPlan): Promise<void> {
  const job = await prisma.job.update({
    where: { id: jobId },
    data: { state: "running", startedAt: new Date() },
    select: { id: true, postId: true, workspaceId: true },
  });

  const results: unknown[] = [];
  const errors: unknown[] = [];
  let done = 0;
  let costCents = 0;

  for (const req of plan.images) {
    try {
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: job.postId },
        select: { accountId: true, style: true, doc: true },
      });

      const asset = await generateImage({
        workspaceId: job.workspaceId,
        accountId: post.accountId,
        prompt: req.prompt,
        style: post.style as TemplateStyleId,
      });

      // Re-read and write back per slot: a long job must not clobber an edit the
      // operator made to a different slide while it was running.
      const doc = post.doc as unknown as PostDoc;
      const slide = doc.slides[req.slideIndex];
      if (slide) {
        slide.f[req.slotId] = {
          id: asset.id,
          name: asset.name,
          url: asset.url,
          kind: "photo",
          ai: true,
        };
        await prisma.post.update({
          where: { id: job.postId },
          data: { doc: doc as unknown as Prisma.InputJsonValue },
        });
      }

      results.push({ slideIndex: req.slideIndex, slotId: req.slotId, assetId: asset.id, url: asset.url });
      costCents += IMAGE_COST_CENTS;
      done += 1;
    } catch (err) {
      errors.push({
        slideIndex: req.slideIndex,
        slotId: req.slotId,
        message: err instanceof Error ? err.message : "Image generation failed",
      });
    }

    await prisma.job.update({ where: { id: jobId }, data: { done, results: results as never, errors: errors as never, costCents } });
  }

  if (plan.voice) {
    try {
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: job.postId },
        select: { accountId: true, style: true, doc: true },
      });
      const lines = assembleScript(
        post.style as TemplateStyleId,
        post.doc as unknown as PostDoc,
        plan.voice.narration,
      );

      const track = await synthesizeVoice({
        workspaceId: job.workspaceId,
        accountId: post.accountId,
        postId: job.postId,
        voiceId: plan.voice.voiceId,
        lines,
      });

      await prisma.post.update({
        where: { id: job.postId },
        data: {
          voiceId: plan.voice.voiceId,
          narration: plan.voice.narration,
          voiceAssetId: track.assetId,
        },
      });

      results.push({ voiceAssetId: track.assetId, url: track.url, estimatedSeconds: track.estimatedSeconds });
      costCents += VOICE_COST_CENTS;
      done += 1;
    } catch (err) {
      errors.push({ message: err instanceof Error ? err.message : "Voice synthesis failed" });
    }
  }

  // "done" even with per-slot errors: the batch ran, and a single bad image is a
  // slot to retry, not a reason to discard the images that worked.
  await prisma.job.update({
    where: { id: jobId },
    data: {
      state: done === 0 && errors.length ? "failed" : "done",
      done,
      results: results as never,
      errors: errors as never,
      costCents,
    },
  });
}

/**
 * Pre-warm the render so the operator's review is instant. Reels go through the
 * worker's async path, so this job polls renderStatus rather than blocking.
 */
export async function startRenderJob(
  caller: StudioCaller,
  postId: string,
): Promise<{ jobId: string }> {
  const post = await ownedPost(caller, postId);
  assertAgentMutable(caller, post);

  const job = await prisma.job.create({
    data: {
      workspaceId: caller.workspaceId,
      postId: post.id,
      apiTokenId: caller.tokenId,
      kind: "render",
      state: "queued",
      total: 1,
    },
    select: { id: true },
  });

  void runRenderJob(job.id, post.id).catch(() => {});
  return { jobId: job.id };
}

async function runRenderJob(jobId: string, postId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { state: "running", startedAt: new Date() },
  });

  try {
    const outcome = await ensureRendered(postId);

    if (outcome.status === "ready") {
      await prisma.job.update({
        where: { id: jobId },
        data: { state: "done", done: 1, results: outcome.mediaUrls.map((url) => ({ url })) as never },
      });
      return;
    }

    // Reel: the worker callback finishes it, so poll until it lands.
    const deadline = Date.now() + 9 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = await renderStatus(postId);

      if (status.status === "ready") {
        await prisma.job.update({
          where: { id: jobId },
          data: { state: "done", done: 1, results: status.mediaUrls.map((url) => ({ url })) as never },
        });
        return;
      }
      if (status.status === "failed") {
        await prisma.job.update({
          where: { id: jobId },
          data: { state: "failed", errors: [{ message: status.error ?? "Render failed" }] as never },
        });
        return;
      }
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { state: "failed", errors: [{ message: "Render did not finish within nine minutes." }] as never },
    });
  } catch (err) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        state: "failed",
        errors: [{ message: err instanceof Error ? err.message : "Render failed" }] as never,
      },
    });
  }
}

export interface JobView {
  jobId: string;
  kind: string;
  state: string;
  done: number;
  total: number;
  results: unknown[];
  errors: unknown[];
}

export async function jobStatus(caller: StudioCaller, jobId: string): Promise<JobView> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, workspaceId: caller.workspaceId },
  });
  if (!job) throw new StudioError("not_found", "Job not found.");

  // A job still running long past its window was lost to a container restart.
  // Report it rather than letting a polling agent wait forever.
  const started = job.startedAt?.getTime() ?? job.createdAt.getTime();
  const stale =
    (job.state === "queued" || job.state === "running") && Date.now() - started > STALE_AFTER_MS;

  return {
    jobId: job.id,
    kind: job.kind,
    state: stale ? "failed" : job.state,
    done: job.done,
    total: job.total,
    results: (job.results ?? []) as unknown[],
    errors: stale
      ? [{ message: "This job was lost to a restart. Start it again." }]
      : ((job.errors ?? []) as unknown[]),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/media.itest.ts
```

Expected: PASS, 12 tests. Two likely first failures, both in the test rather than the implementation: `buildEmptyDoc("reel", "hook")` may need a different archetype id (read `REEL.cover` in `manifests.ts` for a legal one), and `Narration` may not accept the string `"verbatim"` (read the enum in `schema.prisma`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/studio
git commit -m "Run media and renders as pollable jobs

fal.ai and ElevenLabs take up to two minutes, so a blocking tool call risks
a client timeout — and no transport fixes that, since the latency is the
provider's. Webhooks would only serve Hermes; Claude cannot receive one.

Per-slot idempotency is what stops a retry re-billing: a slot already
holding an image is skipped unless forced. A single bad image lands in the
job's errors with its slot, so the agent retries that prompt rather than
the whole batch."
```

---

### Task 8: The MCP endpoint and the orientation tools

**Files:**
- Create: `apps/web/src/lib/studio/assets.ts`
- Create: `apps/web/src/lib/studio/mcp/result.ts`
- Create: `apps/web/src/lib/studio/mcp/server.ts`
- Create: `apps/web/src/app/api/mcp/route.ts`
- Create: `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`
- Modify: `apps/web/package.json` (add the two SDK packages)
- Modify: `apps/web/src/proxy.ts` (exempt `/api/mcp` from session redirects)
- Modify: `apps/web/.env.example` (add `STUDIO_PUBLIC_URL`)

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 5, 6.
- Produces:
  - `function listAssetsForAgent(caller, accountId): Promise<AgentAsset[]>`
  - `function ok(data: unknown): CallToolResult` and `function err(e: unknown): CallToolResult`
  - `function buildStudioServer(caller: StudioCaller): McpServer`
  - `POST /api/mcp`

- [ ] **Step 1: Read the Next.js route-handler guide**

Per `apps/web/AGENTS.md`, read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before writing the route. Confirm for this version: which HTTP method exports are supported, whether `request` is a `NextRequest`, and how to return a JSON response. Do not write the route from memory.

- [ ] **Step 2: Read `proxy.ts` and find the auth-redirect rule**

Read `apps/web/src/proxy.ts`. The MCP route must not be redirected to `/login` when it has no session cookie — it authenticates by header and must be able to return a JSON-RPC error. Note the existing public-path list (`/login`, `/media`, `/render`, `/api/worker`) and how it is matched.

- [ ] **Step 3: Install the SDK**

```bash
cd apps/web && pnpm add @modelcontextprotocol/server@2.0.0 @modelcontextprotocol/client@2.0.0
```

`@modelcontextprotocol/client` is a dev-time need only (the transport test drives the handler in-process), but it is small and keeping both at the same version avoids a protocol-version mismatch inside the test. Verify both landed at 2.0.0 in `package.json`.

- [ ] **Step 4: Confirm the SDK's actual exported API before using it**

```bash
cd apps/web && cat node_modules/@modelcontextprotocol/server/package.json | grep -A5 '"exports"' && ls node_modules/@modelcontextprotocol/server/dist/*.d.ts
```

Then read the type declarations for `createMcpHandler`, `McpServer`, `registerTool` and `registerPrompt`. Specifically confirm:
- the factory receives `{ authInfo }` and `authInfo` is pass-through — the SDK does **not** verify tokens or read headers itself
- `handler.fetch(request, options?)` accepts `authInfo` in `options`
- where `instructions` is set — on the `McpServer` constructor's second argument, or on the handler

The code below assumes the constructor. **If the declarations say otherwise, follow the declarations** and adjust; they are the authority, not this plan.

- [ ] **Step 5: Write the asset listing function**

Create `apps/web/src/lib/studio/assets.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/db";
import { ownedAccount } from "./posts";
import type { StudioCaller } from "./types";

/**
 * The workspace's image library.
 *
 * Exposed so an agent can reuse an existing image instead of paying fal.ai for a
 * new one — the cheapest saving available to it.
 */

export interface AgentAsset {
  id: string;
  name: string;
  url: string;
  kind: string;
  ai: boolean;
  width: number | null;
  height: number | null;
}

export async function listAssetsForAgent(
  caller: StudioCaller,
  accountId: string,
): Promise<AgentAsset[]> {
  const account = await ownedAccount(caller, accountId);

  const assets = await prisma.asset.findMany({
    where: {
      workspaceId: caller.workspaceId,
      kind: { in: ["photo", "screen", "logo"] },
      OR: [{ accountId: account.id }, { accountId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, name: true, url: true, kind: true, ai: true, width: true, height: true },
  });

  return assets;
}
```

- [ ] **Step 6: Write the result mapper**

Create `apps/web/src/lib/studio/mcp/result.ts`:

```ts
import { asStudioError } from "../errors";

/**
 * Every tool answers in one of two shapes.
 *
 * Failures carry a code and an explicit `retryable` flag because agents loop
 * forever on ambiguous errors: a bad argument must never look like a transient
 * outage. The JSON goes in `structuredContent` for machine reading and is also
 * serialised into `content` text, since not every client surfaces the former.
 */

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  const payload = { ok: true, data } as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function err(e: unknown): ToolResult {
  const studio = asStudioError(e);
  const payload = {
    ok: false,
    code: studio.code,
    message: studio.message,
    retryable: studio.retryable,
  } as Record<string, unknown>;

  // Log server-side; the agent gets the message, we keep the stack.
  console.error("[mcp tool]", studio.code, studio.message);

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

/** Wrap a tool body so no throw escapes as a protocol-level failure. */
export function guard<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return err(e);
    }
  };
}
```

- [ ] **Step 7: Write the failing transport test**

Create `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/mcp/route";
import { mintToken, revokeToken } from "../tokens";
import { withTestWorkspace } from "./helpers";

/**
 * Drives the real route handler with real Requests. The negative cases are the
 * point: every rejection here is a door someone could otherwise walk through,
 * and the auth check must run before any tool body does.
 */
vi.mock("@/lib/ai/client", () => ({
  completeJson: vi.fn(async () => ({
    slides: { "0": { kicker: "K", hook: "A hook" } },
    caption: "c",
    firstComment: "f",
    hashtags: ["#a"],
  })),
  openaiFor: vi.fn(),
}));

let nextId = 1;

async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "Mcp-Method": method,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const request = new Request("https://studio.test/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "itest", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });

  const response = await POST(request as never);
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** Parse a tool's structured payload out of a tools/call result. */
function payload(body: { result?: { structuredContent?: Record<string, unknown> } }) {
  return body.result?.structuredContent ?? {};
}

describe("POST /api/mcp authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const { status } = await rpc(null, "tools/list");
    expect(status).toBe(401);
  });

  it("rejects an unissued token", async () => {
    const { status } = await rpc("rss_definitelynotarealtoken", "tools/list");
    expect(status).toBe(401);
  });

  it("rejects a revoked token", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await revokeToken(f.workspaceId, id);
      const { status } = await rpc(token, "tools/list");
      expect(status).toBe(401);
    }));

  it("sets WWW-Authenticate so a client knows the scheme", async () => {
    const request = new Request("https://studio.test/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toMatch(/Bearer/);
  });
});

describe("POST /api/mcp discovery", () => {
  it("answers server/discover with the supported versions and instructions", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft", "media", "render"],
      });

      const { status, body } = await rpc(token, "server/discover");
      expect(status).toBe(200);
      expect(body.result.supportedVersions).toContain("2026-07-28");
      expect(body.result.instructions).toMatch(/list_accounts/);
      expect(body.result.capabilities).toHaveProperty("tools");
    }));

  it("lists exactly the ten tools, in a deterministic order", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft", "media", "render"],
      });

      const { body } = await rpc(token, "tools/list");
      const names = body.result.tools.map((t: { name: string }) => t.name);

      expect(names).toEqual([
        "list_accounts",
        "describe_template",
        "list_posts",
        "list_assets",
        "create_draft",
        "revise_draft",
        "check_draft",
        "start_media",
        "start_render",
        "job_status",
      ]);
      expect(names).not.toContain("schedule_post");
      expect(names).not.toContain("publish_now");
    }));

  it("describes every tool and every argument", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft", "media", "render"],
      });

      const { body } = await rpc(token, "tools/list");
      for (const tool of body.result.tools) {
        expect(tool.description, tool.name).toBeTruthy();
        expect(tool.description.length, tool.name).toBeGreaterThan(30);
        expect(tool.inputSchema, tool.name).toBeDefined();
      }

      const createDraft = body.result.tools.find((t: { name: string }) => t.name === "create_draft");
      expect(JSON.stringify(createDraft.inputSchema)).toMatch(/brief/);
    }));
});

describe("orientation tools", () => {
  it("list_accounts is scoped to the token's workspace", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        const { token } = await mintToken({
          workspaceId: f.workspaceId,
          userId: f.userId,
          name: "t",
          scopes: ["draft"],
        });

        const { body } = await rpc(token, "tools/call", {
          name: "list_accounts",
          arguments: {},
        });

        const data = payload(body).data as { id: string }[];
        expect(data.map((a) => a.id)).toEqual([f.accountId]);
        expect(data.map((a) => a.id)).not.toContain(other.accountId);
      }),
    ));

  it("describe_template returns the manifest an agent fills against", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });

      const { body } = await rpc(token, "tools/call", {
        name: "describe_template",
        arguments: { style: "carousel" },
      });

      const data = payload(body).data as { style: string; kinds: unknown[] }[];
      expect(data).toHaveLength(1);
      expect(data[0].style).toBe("carousel");
      expect(data[0].kinds.length).toBeGreaterThan(0);
    }));

  it("returns a structured failure, not a protocol error, for a bad argument", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });

      const { status, body } = await rpc(token, "tools/call", {
        name: "list_assets",
        arguments: { accountId: "does-not-exist" },
      });

      expect(status).toBe(200);
      expect(payload(body)).toMatchObject({ ok: false, code: "not_found", retryable: false });
    }));
});

describe("scopes", () => {
  it("refuses a drafting tool to a media-only token", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["media"],
      });

      const { body } = await rpc(token, "tools/call", {
        name: "create_draft",
        arguments: {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "t",
        },
      });

      expect(payload(body)).toMatchObject({ ok: false, code: "forbidden" });
    }));
});

describe("legacy protocol traffic", () => {
  it("still answers a 2025-era initialize handshake", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });

      const request = new Request("https://studio.test/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "legacy-itest", version: "1.0.0" },
          },
        }),
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.protocolVersion).toBeTruthy();
    }));
});
```

- [ ] **Step 8: Run it to verify it fails**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts
```

Expected: FAIL — cannot resolve `@/app/api/mcp/route`.

- [ ] **Step 9: Write the server builder with the orientation tools**

Create `apps/web/src/lib/studio/mcp/server.ts`:

```ts
import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { listAccountsForAgent } from "../accounts";
import { listAssetsForAgent } from "../assets";
import { describeTemplates } from "../templates";
import { listPosts } from "../posts";
import { requireScope } from "../tokens";
import { guard } from "./result";
import type { StudioCaller } from "../types";
import type { TemplateStyleId } from "@/lib/templates/types";

/**
 * The agent-facing tool surface.
 *
 * A fresh server is built per request — the protocol is stateless as of
 * 2026-07-28, and the caller differs per request anyway.
 *
 * Tool order is fixed and deterministic: the spec asks for it so clients can
 * cache tools/list and so prompt-cache hit rates stay high.
 */

const STYLES = ["carousel", "reel", "story", "single", "photo"] as const;

/**
 * Server-level guidance. Clients may fold this into their system prompt, so it
 * carries the ordering rules a tool description cannot: what to call first, and
 * what this server will refuse to do.
 */
const INSTRUCTIONS = `This is the ReggieSpace Social Studio. It turns a researched topic into a
finished social post draft for one brand account, and stops there — a human reviews and
publishes. There is no publishing tool and asking for one will not find one.

Always call list_accounts first. Each account has a locale ("en" or "pt_BR") and that locale
decides everything downstream: the language the copy is written in, and which culture you
should have researched. Do your own research BEFORE calling create_draft — local holidays,
regional events, seasonality, what is actually live for that audience right now — and pass it
as the "brief" argument. Translation is not adaptation: a post written for a US audience and
translated into Portuguese will read as foreign.

Call describe_template before create_draft so you know the archetypes and the per-slot
character budgets you are writing against. Call list_posts to see what has already been made
so you do not repeat a recent topic.

Order of work: list_accounts → describe_template → (your own research) → create_draft →
check_draft → revise_draft until cleared → start_media → job_status until done → start_render
→ job_status until done. Stop there and report the post id.

Media and rendering are slow, so they return a jobId instead of blocking. Poll job_status;
do not call start_media again while a job is running.

Every tool answers { ok: true, data } or { ok: false, code, message, retryable }. When
retryable is false, fix your arguments or stop — do not retry the same call. Code
"cap_reached" means this token has spent its daily budget: stop and report it.

Never invent statistics. This is health-adjacent content and the account's claims guardrail
will reject copy that claims the product diagnoses, treats or prevents anything.`;

export function buildStudioServer(caller: StudioCaller): McpServer {
  const server = new McpServer(
    { name: "reggiespace-social-studio", version: "1.0.0" },
    { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List brand accounts",
      description:
        "The brand accounts in this workspace. Call this first, every time. Returns each account's id, handle, locale ('en' or 'pt_BR' — this decides the copy language and which culture to research), content pillars, download URL, whether the claims guardrail is on, and the narration voices available. Read-only and free.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => listAccountsForAgent(caller)),
  );

  server.registerTool(
    "describe_template",
    {
      title: "Describe the post templates",
      description:
        "The template manifests you write against: for each style, its archetypes (cover kinds), the default slide sequence per archetype, every slot with its exact character budget and whether it is required, the slide-count bounds, and the caption/first-comment/hashtag limits. Call this before create_draft — copy that busts a budget is trimmed, and a required slot left empty blocks the review gate. Read-only and free.",
      inputSchema: z.object({
        style: z
          .enum(STYLES)
          .optional()
          .describe("Limit to one style. Omit to get all five."),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ style }) => describeTemplates(style as TemplateStyleId | undefined)),
  );

  server.registerTool(
    "list_posts",
    {
      title: "List recent posts",
      description:
        "Recent posts for this workspace, newest first, with their topic, style, status and whether they already have voice or rendered media. Use it to avoid repeating a topic you posted recently, and to find a draft you created earlier. Read-only and free.",
      inputSchema: z.object({
        accountId: z.string().optional().describe("Limit to one brand account."),
        status: z
          .enum(["draft", "scheduled", "published"])
          .optional()
          .describe("Limit to one status."),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20, max 100."),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async (args) => listPosts(caller, args)),
  );

  server.registerTool(
    "list_assets",
    {
      title: "List the image library",
      description:
        "Images already in this workspace's library, usable in any image slot. Check here before calling start_media with new prompts — reusing an existing image costs nothing, while generating one spends against this token's daily budget. Read-only and free.",
      inputSchema: z.object({
        accountId: z.string().describe("The brand account, from list_accounts."),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ accountId }) => listAssetsForAgent(caller, accountId)),
  );

  registerDraftTools(server, caller);
  registerMediaTools(server, caller);

  return server;
}

/** Defined in Task 9. */
declare function registerDraftTools(server: McpServer, caller: StudioCaller): void;
/** Defined in Task 10. */
declare function registerMediaTools(server: McpServer, caller: StudioCaller): void;
```

**Important:** the two `declare function` lines are placeholders so this task compiles on its own. Task 9 and Task 10 replace them with real implementations in this same file. If you are executing Task 8 in isolation, stub them as empty functions instead:

```ts
function registerDraftTools(_server: McpServer, _caller: StudioCaller): void {}
function registerMediaTools(_server: McpServer, _caller: StudioCaller): void {}
```

and expect the `tools/list` ordering test to fail until Task 10 lands. Note that in the test file, and do not weaken the assertion to match the stub.

- [ ] **Step 10: Write the route**

Create `apps/web/src/app/api/mcp/route.ts`:

```ts
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildStudioServer } from "@/lib/studio/mcp/server";
import { verifyToken } from "@/lib/studio/tokens";
import type { StudioCaller } from "@/lib/studio/types";

/**
 * The agent-facing MCP endpoint.
 *
 * Stateless per request: protocol 2026-07-28 removed sessions and the initialize
 * handshake outright, which is also what this deployment needs — it sits behind
 * Traefik and may run more than one instance, so a session-bound transport would
 * require sticky routing.
 *
 * The SDK treats authInfo as strictly pass-through: it does not read headers or
 * verify tokens. So the bearer is verified here, before the handler sees the
 * request, and the resolved caller is handed in.
 */

// Provider calls and renders run well past a serverless budget; this route needs
// the long-lived Node runtime the container already provides.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(({ authInfo }) => {
  const caller = authInfo?.extra?.caller as StudioCaller | undefined;
  if (!caller) {
    // Unreachable: POST rejects before constructing a server. Belt and braces,
    // because a server built without a caller would be a tenancy hole.
    throw new Error("MCP server constructed without an authenticated caller");
  }
  return buildStudioServer(caller);
});

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32020, message: "Invalid or expired token." },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="mcp"',
      },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  let caller: StudioCaller;
  try {
    caller = await verifyToken(request.headers.get("authorization"));
  } catch {
    return unauthorized();
  }

  return handler.fetch(request, {
    authInfo: {
      token: "redacted",
      clientId: caller.tokenId ?? "ui",
      scopes: caller.scopes,
      extra: { caller },
    },
  });
}
```

**Verify against the declarations from Step 4:** the `authInfo` shape above (`token`, `clientId`, `scopes`, `extra`) is the SDK's `AuthInfo`. If the declared type differs, follow the declaration — the only requirement this design has is that the resolved `StudioCaller` reaches the factory.

- [ ] **Step 11: Exempt the route in `proxy.ts`**

Add `/api/mcp` to the public-path list in `apps/web/src/proxy.ts`, next to `/api/worker`. Without this, a request with no session cookie is redirected to `/login` and the agent gets HTML instead of a JSON-RPC error.

- [ ] **Step 12: Add the env var**

Add to `apps/web/.env.example`:

```
# Public origin of this deployment, advertised as the MCP endpoint URL.
# e.g. https://studio.example.com — the endpoint is <STUDIO_PUBLIC_URL>/api/mcp
STUDIO_PUBLIC_URL=http://localhost:3000
```

Then add a `studioPublicUrl()` accessor to `apps/web/src/lib/env.ts`, following the existing accessors' pattern in that file.

- [ ] **Step 13: Run the transport test**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts
```

Expected: the auth, discovery-instructions, and orientation-tool tests PASS. The `tools/list` ordering test and the scopes test FAIL until Tasks 9 and 10 land — that is expected and correct. Do not delete or weaken them.

- [ ] **Step 14: Typecheck and commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

```bash
git add apps/web/src/lib/studio apps/web/src/app/api/mcp apps/web/src/proxy.ts apps/web/.env.example apps/web/src/lib/env.ts apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "Serve the Studio over a stateless MCP endpoint

The SDK treats authInfo as pass-through — it never reads headers or verifies
tokens — so the bearer is checked in the route before a server is built, and
the resolved caller is handed to the factory. A server constructed without
one throws rather than defaulting, because that would be a tenancy hole.

Stateless is not a preference: 2026-07-28 removed sessions and the
initialize handshake, and this deployment sits behind Traefik where a
session-bound transport would need sticky routing. The SDK's default legacy
mode keeps 2025-era clients working, so Hermes's protocol revision does not
need to be known.

/api/mcp joins the public paths in proxy.ts: it authenticates by header, and
must answer a missing token with JSON-RPC rather than a login redirect."
```

---

### Task 9: The drafting tools

**Files:**
- Modify: `apps/web/src/lib/studio/mcp/server.ts`
- Modify: `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`

**Interfaces:**
- Consumes: `buildStudioServer`, `guard` (Task 8); `createDraft`, `reviseDraft`, `checkDraft` (Task 4); `requireScope` (Task 2).
- Produces: `function registerDraftTools(server: McpServer, caller: StudioCaller): void`, registering `create_draft`, `revise_draft`, `check_draft`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`:

```ts
describe("drafting tools", () => {
  /** A draft-scoped token plus a helper that calls a tool with it. */
  async function draftAgent(f: { workspaceId: string; userId: string }) {
    const { token } = await mintToken({
      workspaceId: f.workspaceId,
      userId: f.userId,
      name: "Hermes",
      scopes: ["draft"],
      dailyDraftCap: 5,
    });
    const { encryptSecret } = await import("@/lib/crypto");
    await prisma.credential.create({
      data: {
        workspaceId: f.workspaceId,
        provider: "openai",
        apiKey: encryptSecret("sk-test-not-real"),
      },
    });
    return token;
  }

  it("creates a draft and returns its id, doc and outstanding issues", () =>
    withTestWorkspace(async (f) => {
      const token = await draftAgent(f);

      const { body } = await rpc(token, "tools/call", {
        name: "create_draft",
        arguments: {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "Protein first",
          angle: "What to eat when nothing appeals",
          brief: "Festa Junina peaks in late June; pamonha and quentão are the staples.",
        },
      });

      const result = payload(body);
      expect(result.ok).toBe(true);
      const data = result.data as { postId: string; doc: unknown; issues: string[] };
      expect(data.postId).toBeTruthy();
      expect(Array.isArray(data.issues)).toBe(true);

      const row = await prisma.post.findUniqueOrThrow({ where: { id: data.postId } });
      expect(row.createdVia).toBe("agent");
      expect(row.brief).toContain("pamonha");
    }));

  it("revises a slot and reports the issues that remain", () =>
    withTestWorkspace(async (f) => {
      const token = await draftAgent(f);

      const created = await rpc(token, "tools/call", {
        name: "create_draft",
        arguments: {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "t",
        },
      });
      const { postId } = payload(created).data as { postId: string };

      const revised = await rpc(token, "tools/call", {
        name: "revise_draft",
        arguments: { postId, caption: "A tighter caption", slides: { "0": { kicker: "New" } } },
      });

      expect(payload(revised).ok).toBe(true);
      const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      expect(row.caption).toBe("A tighter caption");
    }));

  it("check_draft reports the clearance gate", () =>
    withTestWorkspace(async (f) => {
      const token = await draftAgent(f);
      const created = await rpc(token, "tools/call", {
        name: "create_draft",
        arguments: {
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          topic: "t",
        },
      });
      const { postId } = payload(created).data as { postId: string };

      const checked = await rpc(token, "tools/call", {
        name: "check_draft",
        arguments: { postId },
      });

      const data = payload(checked).data as { cleared: boolean; issues: string[] };
      expect(typeof data.cleared).toBe("boolean");
      expect(Array.isArray(data.issues)).toBe(true);
    }));

  it("names the legal archetypes when given a bad one, so the agent can self-correct", () =>
    withTestWorkspace(async (f) => {
      const token = await draftAgent(f);

      const { body } = await rpc(token, "tools/call", {
        name: "create_draft",
        arguments: {
          accountId: f.accountId,
          style: "carousel",
          archetype: "not-a-kind",
          topic: "t",
        },
      });

      const result = payload(body);
      expect(result).toMatchObject({ ok: false, code: "bad_request", retryable: false });
      expect(result.message).toMatch(/1a-knockout/);
    }));

  it("reports a cap breach as non-retryable", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
        dailyDraftCap: 1,
      });
      const { encryptSecret } = await import("@/lib/crypto");
      await prisma.credential.create({
        data: {
          workspaceId: f.workspaceId,
          provider: "openai",
          apiKey: encryptSecret("sk-test-not-real"),
        },
      });
      const args = {
        accountId: f.accountId,
        style: "carousel",
        archetype: "1a-knockout",
        topic: "t",
      };

      await rpc(token, "tools/call", { name: "create_draft", arguments: args });
      const { body } = await rpc(token, "tools/call", { name: "create_draft", arguments: args });

      expect(payload(body)).toMatchObject({
        ok: false,
        code: "cap_reached",
        retryable: false,
      });
    }));
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts
```

Expected: the new drafting tests FAIL — `Tool create_draft not found`.

- [ ] **Step 3: Replace the `registerDraftTools` placeholder**

In `apps/web/src/lib/studio/mcp/server.ts`, delete the `declare function registerDraftTools` line (or the empty stub) and add the real implementation. Add the imports at the top of the file:

```ts
import { checkDraft, createDraft, reviseDraft } from "../draft";
```

Then:

```ts
/**
 * Drafting: synchronous, seconds. create_draft makes one structured OpenAI call;
 * revise_draft makes none at all, which is why fixing a budget violation is free.
 */
function registerDraftTools(server: McpServer, caller: StudioCaller): void {
  server.registerTool(
    "create_draft",
    {
      title: "Create a post draft",
      description:
        "Write a complete post draft: per-slot copy honouring every character budget, plus caption, first comment and hashtags. Do your research BEFORE calling this and pass it as `brief` — that is the only channel by which local events, holidays and seasonality reach the copy. The result is saved as a draft for a human to review; nothing is published. Costs one generation against this token's daily draft cap. Pass `postId` to regenerate an existing draft in place, which keeps any images already filled and does not count against the cap.",
      inputSchema: z.object({
        accountId: z.string().describe("Brand account id from list_accounts."),
        style: z.enum(STYLES).describe("Template style. See describe_template."),
        archetype: z
          .string()
          .describe("Cover kind id, e.g. '1a-knockout'. Must be one of the style's `covers`."),
        topic: z.string().min(1).describe("What the post is about, in a phrase."),
        angle: z
          .string()
          .optional()
          .describe("One sentence on how to treat the topic — the reader's situation, and what they would save or send it for."),
        pillar: z
          .string()
          .nullable()
          .optional()
          .describe("Content pillar name from list_accounts, if it belongs to one."),
        brief: z
          .string()
          .optional()
          .describe(
            "Your research, as prose: local holidays, regional events, seasonality, what is live for this locale's audience now. Used as background to ground the copy — it will not be quoted. This is what makes a pt_BR post adapted rather than translated.",
          ),
        postId: z
          .string()
          .optional()
          .describe("Regenerate this existing draft instead of creating a new one."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    guard(async (args) => {
      requireScope(caller, "draft");
      return createDraft(caller, {
        accountId: args.accountId,
        style: args.style as TemplateStyleId,
        archetype: args.archetype,
        topic: args.topic,
        angle: args.angle ?? null,
        pillar: args.pillar ?? null,
        brief: args.brief ?? null,
        postId: args.postId,
      });
    }),
  );

  server.registerTool(
    "revise_draft",
    {
      title: "Revise a draft",
      description:
        "Overwrite specific slots, the caption, the first comment or the hashtags on a draft you created. Deterministic and free — no model call — so this is the right way to fix an issue check_draft reported. Values over their budget are trimmed rather than rejected. You may only revise drafts this token created, and only while they are still drafts.",
      inputSchema: z.object({
        postId: z.string().describe("The draft to revise."),
        slides: z
          .record(z.string(), z.record(z.string(), z.unknown()))
          .optional()
          .describe(
            'Slide index as a string key → the slots to overwrite, e.g. { "0": { "hook": "New hook" } }. Slot ids come from describe_template.',
          ),
        caption: z.string().optional().describe("Replacement post caption."),
        first: z.string().optional().describe("Replacement first comment."),
        hashtags: z.array(z.string()).optional().describe("Replacement hashtags; '#' is added if missing."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args) => {
      requireScope(caller, "draft");
      return reviseDraft(caller, args.postId, {
        slides: args.slides as never,
        caption: args.caption,
        first: args.first,
        hashtags: args.hashtags,
      });
    }),
  );

  server.registerTool(
    "check_draft",
    {
      title: "Check a draft against the template contract",
      description:
        "The clearance gate — the same check publishing enforces. Returns `cleared` plus a list of problems in prose ('Slide 2: Hook is empty'). Call this after create_draft and after every revise_draft, and keep revising until it clears. Read-only and free.",
      inputSchema: z.object({ postId: z.string().describe("The draft to check.") }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ postId }) => {
      requireScope(caller, "draft");
      return checkDraft(caller, postId);
    }),
  );
}
```

- [ ] **Step 4: Run the drafting tests to verify they pass**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts -t "drafting tools"
```

Expected: PASS, 5 tests. The scopes test from Task 8 should now pass too.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/studio
git commit -m "Expose the drafting tools

The brief argument carries the whole point of the surface, so its description
says plainly what it is for and that it will not be quoted — a model handed
unexplained context lifts phrases from it.

Bad-argument errors name the legal values (the archetype error lists the
style's covers), because an agent that cannot see why it was rejected retries
the same call."
```

---

### Task 10: The media tools and the `daily_post` prompt

**Files:**
- Modify: `apps/web/src/lib/studio/mcp/server.ts`
- Modify: `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`

**Interfaces:**
- Consumes: `startMedia`, `startRenderJob`, `jobStatus` (Task 7).
- Produces: `function registerMediaTools(server, caller): void` registering `start_media`, `start_render`, `job_status`; and a `daily_post` prompt.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/studio/__tests__/mcp-transport.itest.ts`:

```ts
describe("media tools", () => {
  it("start_media returns a jobId immediately rather than blocking", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["media"],
        dailyCapCents: 10_000,
      });

      const post = await prisma.post.create({
        data: {
          workspaceId: f.workspaceId,
          accountId: f.accountId,
          style: "carousel",
          archetype: "1a-knockout",
          doc: { slides: [], caption: "", first: "", hashtags: [], linkSticker: "", mention: "" },
          createdVia: "agent",
          apiTokenId: (await prisma.apiToken.findFirstOrThrow({
            where: { workspaceId: f.workspaceId },
            orderBy: { createdAt: "desc" },
          })).id,
        },
        select: { id: true },
      });

      const { body } = await rpc(token, "tools/call", {
        name: "start_media",
        arguments: { postId: post.id, images: "auto" },
      });

      const data = payload(body).data as { jobId: string };
      expect(data.jobId).toBeTruthy();
    }));

  it("job_status reports an unknown job as not_found rather than hanging", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["media"],
      });

      const { body } = await rpc(token, "tools/call", {
        name: "job_status",
        arguments: { jobId: "no-such-job" },
      });

      expect(payload(body)).toMatchObject({ ok: false, code: "not_found" });
    }));

  it("refuses start_render to a token without the render scope", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft"],
      });

      const { body } = await rpc(token, "tools/call", {
        name: "start_render",
        arguments: { postId: "anything" },
      });

      expect(payload(body)).toMatchObject({ ok: false, code: "forbidden" });
    }));
});

describe("prompts", () => {
  it("offers a daily_post prompt that encodes the ordered workflow", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes",
        scopes: ["draft", "media", "render"],
      });

      const listed = await rpc(token, "prompts/list");
      expect(listed.body.result.prompts.map((p: { name: string }) => p.name)).toContain("daily_post");

      const got = await rpc(token, "prompts/get", {
        name: "daily_post",
        arguments: { accountId: f.accountId },
      });

      const text = JSON.stringify(got.body.result.messages);
      expect(text).toMatch(/research/i);
      expect(text).toMatch(/check_draft/);
      expect(text).toContain(f.accountId);
      // It must not tell the agent to publish — there is no such tool.
      expect(text).not.toMatch(/publish|schedule/i);
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts -t "media tools"
```

Expected: FAIL — `Tool start_media not found`.

- [ ] **Step 3: Replace the `registerMediaTools` placeholder**

In `apps/web/src/lib/studio/mcp/server.ts`, add the import:

```ts
import { jobStatus, startMedia, startRenderJob } from "../media";
```

and replace the placeholder:

```ts
/**
 * Media and rendering: too slow to answer inline, so each returns a handle the
 * agent polls. Protocol 2026-07-28 prescribes exactly this — server-minted
 * handles passed back as ordinary tool arguments.
 */
function registerMediaTools(server: McpServer, caller: StudioCaller): void {
  server.registerTool(
    "start_media",
    {
      title: "Generate images and narration",
      description:
        "Fill the draft's image slots and, on a reel or story, synthesize narration. Returns a jobId immediately — this takes 20-120 seconds per image, so poll job_status rather than waiting. Slots that already hold an image are skipped unless you pass force, so a retry costs nothing extra. A single failed image lands in the job's errors with its slot and prompt; retry just that slot. This SPENDS MONEY against the token's daily cap: check list_assets for a reusable image first. Voice is only accepted on reel and story.",
      inputSchema: z.object({
        postId: z.string().describe("The draft to fill."),
        images: z
          .union([
            z.literal("auto"),
            z.array(
              z.object({
                slideIndex: z.number().int().min(0),
                slotId: z.string(),
                prompt: z.string().min(1),
              }),
            ),
          ])
          .optional()
          .describe(
            "'auto' derives a prompt for every empty image slot from the copy already on that slide. An array targets exact slots — use it to carry your cultural research into the imagery, which for a pt_BR account matters as much as the copy. Pass [] to generate no images.",
          ),
        voice: z
          .object({
            voiceId: z.string().describe("A voice id from list_accounts."),
            narration: z.enum(["verbatim", "expanded"]).describe("How to read the on-screen copy."),
          })
          .optional()
          .describe("Reel and story only."),
        force: z
          .boolean()
          .optional()
          .describe("Regenerate slots that already hold an image. Spends again — default false."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args) => {
      requireScope(caller, "media");
      return startMedia(caller, {
        postId: args.postId,
        images: args.images as never,
        voice: args.voice,
        force: args.force,
      });
    }),
  );

  server.registerTool(
    "start_render",
    {
      title: "Render the post's art",
      description:
        "Render the finished slides (or, for a reel, the narrated mp4) so the human's review is instant instead of starting a render on arrival. Returns a jobId — reels take minutes, so poll job_status. Run this last, after check_draft clears and start_media has finished. Rendering does not publish anything.",
      inputSchema: z.object({ postId: z.string().describe("The draft to render.") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async ({ postId }) => {
      requireScope(caller, "render");
      return startRenderJob(caller, postId);
    }),
  );

  server.registerTool(
    "job_status",
    {
      title: "Check a media or render job",
      description:
        "Progress for a jobId from start_media or start_render: state ('queued', 'running', 'done', 'failed'), how many of how many units finished, the results, and any per-unit errors. Poll every few seconds. state 'done' with a non-empty errors array means the batch ran but some units failed — retry those, not the whole batch. Read-only and free.",
      inputSchema: z.object({ jobId: z.string().describe("From start_media or start_render.") }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ jobId }) => jobStatus(caller, jobId)),
  );

  registerDailyPostPrompt(server);
}

/**
 * The whole morning workflow as a selectable prompt.
 *
 * Prompts are user-selectable rather than model-invoked, which makes this the
 * thing the operator or a cron names directly instead of restating the sequence
 * in every scheduled run.
 */
function registerDailyPostPrompt(server: McpServer): void {
  server.registerPrompt(
    "daily_post",
    {
      title: "Draft today's post for one brand account",
      description:
        "The full morning workflow: orient, research the account's locale, draft, clear the gate, fill media, render, and hand over for review.",
      argsSchema: z.object({
        accountId: z.string().describe("The brand account to write for, from list_accounts."),
        style: z
          .string()
          .optional()
          .describe("Force a style. Omit to let the workflow choose one that suits the topic."),
      }),
    },
    ({ accountId, style }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Draft today's post for brand account ${accountId} in the ReggieSpace Social Studio.`,
              ``,
              `1. Call list_accounts and read this account's locale, pillars and voice. The locale`,
              `   decides the language AND which culture you research — treat those as one decision.`,
              `2. Call list_posts for this account and note the recent topics. Do not repeat one.`,
              `3. Call describe_template${style ? ` for style "${style}"` : ""} and pick an archetype`,
              `   whose slots suit what you want to say.`,
              `4. RESEARCH, using your own tools, before drafting: what is live for this audience`,
              `   right now — local holidays and observances in the coming three weeks, regional`,
              `   events, the season they are actually in, anything in the news this audience is`,
              `   talking about. For a pt_BR account this is Brazilian context, not translated US`,
              `   context; Festa Junina, Carnaval and a Southern-Hemisphere calendar are real and a`,
              `   "New Year reset" framing is not. Write two or three sentences of findings.`,
              `5. Call create_draft with the topic, an angle, and your findings as \`brief\`.`,
              `6. Call check_draft. If it is not cleared, fix each issue with revise_draft and check`,
              `   again. Repeat until cleared — revising is free.`,
              `7. Call list_assets. Reuse a suitable image if there is one; otherwise call start_media`,
              `   with prompts that reflect your research, plus voice if this is a reel or story.`,
              `   Poll job_status until done. Retry only the slots that errored.`,
              `8. Call start_render and poll job_status until done.`,
              `9. Report the post id, the topic, why you chose it, and anything still outstanding.`,
              ``,
              `Do not attempt to publish or schedule: a human reviews and publishes, and no tool here`,
              `can do it. If a tool returns retryable: false, fix your arguments or stop — and if it`,
              `returns code "cap_reached", stop and say so.`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
```

- [ ] **Step 4: Run the whole transport suite**

```bash
cd apps/web && pnpm exec vitest run --config vitest.integration.config.ts src/lib/studio/__tests__/mcp-transport.itest.ts
```

Expected: PASS, every test including the Task 8 `tools/list` ordering assertion. If the order assertion fails, the registration order in `buildStudioServer` does not match the expected list — fix the registration order, not the test.

- [ ] **Step 5: Verify `registerPrompt`'s actual signature**

If Step 4 fails on the prompt tests, read `node_modules/@modelcontextprotocol/server/dist/*.d.ts` for `registerPrompt` and correct the call. The declaration is the authority.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/studio
git commit -m "Expose the media tools and a daily_post prompt

Every slow tool's description says outright that it spends money and points
at list_assets first, because the cheapest saving available to an agent is
reusing an image it already has.

The prompt carries the ordering a tool description cannot: research before
drafting, revise until the gate clears, and no attempt to publish. Prompts
are user-selectable, so a cron names this instead of restating the sequence
every morning."
```

---

### Task 11: Token management in Settings

**Files:**
- Create: `apps/web/src/app/actions/tokens.ts`
- Create: `apps/web/src/app/(app)/settings/agent-tokens.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `mintToken`, `listTokens`, `revokeToken`, `TokenSummary` (Task 2); `ALL_SCOPES` (Task 2).
- Produces: `mintTokenAction`, `revokeTokenAction`, and an `<AgentTokens />` panel.

- [ ] **Step 1: Read the existing Settings page and one of its panels**

Read `apps/web/src/app/(app)/settings/page.tsx` and `apps/web/src/app/actions/settings.ts`. Match the existing panel structure, form pattern, `ActionResult` handling and styling conventions exactly — this task adds a panel, it does not introduce a new way of writing one.

- [ ] **Step 2: Write the server actions**

Create `apps/web/src/app/actions/tokens.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { asStudioError } from "@/lib/studio/errors";
import { listTokens, mintToken, revokeToken, type TokenSummary } from "@/lib/studio/tokens";
import type { ActionResult } from "./create";

/**
 * Agent token management.
 *
 * The plaintext is returned exactly once, by mintTokenAction, and never again —
 * the caller must show it to the operator immediately.
 */

function fail(err: unknown): { ok: false; error: string } {
  const e = asStudioError(err);
  console.error("[tokens action]", e.code, e.message);
  return { ok: false, error: e.message };
}

export async function listTokensAction(): Promise<ActionResult<TokenSummary[]>> {
  try {
    const auth = await requireAuth();
    return { ok: true, data: await listTokens(auth.workspaceId) };
  } catch (err) {
    return fail(err);
  }
}

export async function mintTokenAction(input: {
  name: string;
  scopes: string[];
  dailyCapCents?: number;
  dailyDraftCap?: number;
}): Promise<ActionResult<{ token: string; prefix: string }>> {
  try {
    const auth = await requireAuth();
    const { token, prefix } = await mintToken({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      name: input.name,
      scopes: input.scopes,
      dailyCapCents: input.dailyCapCents,
      dailyDraftCap: input.dailyDraftCap,
    });
    revalidatePath("/settings");
    return { ok: true, data: { token, prefix } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeTokenAction(id: string): Promise<ActionResult<{ revoked: true }>> {
  try {
    const auth = await requireAuth();
    await revokeToken(auth.workspaceId, id);
    revalidatePath("/settings");
    return { ok: true, data: { revoked: true } };
  } catch (err) {
    return fail(err);
  }
}
```

- [ ] **Step 3: Write the panel**

Create `apps/web/src/app/(app)/settings/agent-tokens.tsx` as a client component. Requirements, all of which matter:

- A form with: name (text, required), scope checkboxes for `draft` / `media` / `render` (all checked by default), a daily spend cap in **dollars** (converted to cents on submit, default $5.00), and a daily draft cap (default 5).
- On success, render the plaintext token **once** in a copyable block with an explicit warning that it will not be shown again. It must not persist across a re-render or a navigation — hold it in component state only, never in a URL or `localStorage`.
- Below the form, a table of existing tokens showing name, prefix, scopes, caps, `lastUsedAt`, and `createdAt`. A revoked token renders struck through with a "revoked" label and no revoke button.
- A revoke button per active token, behind a confirmation, that explains rotation is mint-new-then-revoke-old so a cron never has a window with no valid token.
- Show the endpoint URL — `<STUDIO_PUBLIC_URL>/api/mcp` — next to the form, since the operator needs it and the token together to configure a client.

Follow the existing Settings panels for markup and class conventions. Do not invent a new visual language.

- [ ] **Step 4: Mount it in the Settings page**

Add `<AgentTokens tokens={...} endpoint={...} />` to `apps/web/src/app/(app)/settings/page.tsx`, loading the token list server-side the way the page already loads its other data, and passing `env.studioPublicUrl()` for the endpoint.

- [ ] **Step 5: Verify in the browser**

Start the dev server via the preview tooling. Then:
1. Open Settings and mint a token named "Hermes cron" with all three scopes.
2. Confirm the plaintext appears once, starts with `rss_`, and is copyable.
3. Reload the page and confirm the plaintext is **gone** and only the prefix shows.
4. Revoke it and confirm it renders as revoked with no revoke button.
5. Take a screenshot of the panel.

- [ ] **Step 6: Confirm a revoked token is actually dead**

With the dev server running, using the token you copied before revoking:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/mcp -H 'Content-Type: application/json' -H "Authorization: Bearer $REVOKED_TOKEN" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: `401`. This is the end-to-end proof that the UI's revoke reaches the auth path.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/actions/tokens.ts "apps/web/src/app/(app)/settings"
git commit -m "Mint and revoke agent tokens from Settings

The plaintext is shown once and held in component state only — not a URL,
not localStorage — so a reload cannot resurrect it.

Revoke has no counterpart edit: rotation is mint-new-then-revoke-old, which
is the only order that leaves a running cron no window without a valid
token."
```

---

### Task 12: The Claude skill

**Files:**
- Create: `apps/web/scripts/generate-tool-reference.ts`
- Create: `docs/agent-skill/SKILL.md`
- Create: `docs/agent-skill/TOOLS.md` (generated)
- Modify: `apps/web/package.json` (add `tools:doc` script)

**Interfaces:**
- Consumes: `buildStudioServer` (Task 8).
- Produces: `docs/agent-skill/SKILL.md` and a generated `TOOLS.md`.

- [ ] **Step 1: Write the reference generator**

Create `apps/web/scripts/generate-tool-reference.ts`. It builds a server with a dummy caller, reads back the registered tools, and writes `docs/agent-skill/TOOLS.md` with each tool's name, description and input schema.

The point is anti-drift: the skill must not be able to document a signature that no longer exists. Read the SDK declarations for how to enumerate registered tools — if there is no public accessor, call the handler's `tools/list` in-process (as the transport test does) and generate from that response instead.

```bash
cd apps/web && pnpm exec tsx scripts/generate-tool-reference.ts
```

Add to `apps/web/package.json`:

```json
    "tools:doc": "tsx scripts/generate-tool-reference.ts"
```

- [ ] **Step 2: Write `SKILL.md`**

Create `docs/agent-skill/SKILL.md` with frontmatter matching the skill format:

```markdown
---
name: reggiespace-social-studio
description: Use when drafting social posts for a ReggieSpace / Gastric IQ brand account through the Studio's MCP tools — especially on a scheduled run. Covers how to research a locale's culture before drafting, which is the part the tools cannot do for you.
---
```

The body must cover, and must not duplicate what the tool descriptions already say:

1. **What this is and where it stops.** A draft for a human to review. No publishing.
2. **The research method** — the reason this skill exists:
   - Fixed observances for the coming three weeks in the account's locale.
   - Which are regional rather than national (Festa Junina is June-weighted and strongest in the Northeast; treat it as regional).
   - Hemisphere: a January "New Year reset, back to the gym" framing is high summer and school holidays in Brazil. Season-led copy must match the reader's actual season.
   - What this specific audience is discussing now, not what is generally in the news.
   - How much is enough: two or three sentences of specifics. A brief that could describe any country is not research.
3. **What makes a bad brief** — with a worked pair. Bad: "Brazilians like festive food." Good: "Festa Junina runs through June, heaviest in the Northeast; the table is pamonha, canjica and quentão — fried, sweet and shared, and it lasts weeks rather than a single evening."
4. **The tool sequence**, pointing at `TOOLS.md` for signatures rather than restating them.
5. **Error handling:** `retryable: false` means fix or stop; `cap_reached` means stop and report.
6. **Cron wiring:** how to schedule the run, and that the token goes in the client's MCP config, never in the prompt.
7. **A link to `TOOLS.md`** with a line saying it is generated and not to be hand-edited.

- [ ] **Step 3: Verify the skill's claims against the generated reference**

Read `TOOLS.md` and check every tool name, argument name and enum value the skill mentions actually exists. Fix the skill, not the reference.

- [ ] **Step 4: Commit**

```bash
git add docs/agent-skill apps/web/scripts apps/web/package.json
git commit -m "Add the agent skill and a generated tool reference

The skill owns the one thing the server cannot: how to research a locale
before drafting. Tool descriptions travel with the protocol and cover
mechanics; nothing in tools/list can tell an agent that a January 'new year
reset' framing lands in Brazilian high summer.

The tool reference is generated from the registered tools so the skill
cannot document a signature that no longer exists."
```

---

### Task 13: End-to-end verification

**Files:**
- Create: `apps/web/src/lib/studio/__tests__/morning-run.itest.ts`

**Interfaces:**
- Consumes: everything.
- Produces: no new source.

- [ ] **Step 1: Write the end-to-end test**

Create `apps/web/src/lib/studio/__tests__/morning-run.itest.ts`. It drives the real route handler over HTTP-shaped `Request`s — no direct function calls — through the exact morning sequence for a pt-BR account:

`server/discover` → `tools/list` → `list_accounts` → `describe_template` → `create_draft` with a pt-BR brief → `check_draft` → `revise_draft` if not cleared → `check_draft` again → `start_media` → poll `job_status` → `start_render` → poll `job_status`.

Stub only `@/lib/ai/client`, `@/lib/ai/fal`, `@/lib/ai/voice` and `@/lib/render`. Assert at the end:

```ts
const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
expect(row.status).toBe("draft");          // nothing was published
expect(row.createdVia).toBe("agent");
expect(row.apiTokenId).toBe(tokenId);
expect(row.brief).toContain("Festa Junina");
expect(row.mediaUrls.length).toBeGreaterThan(0);
```

The last two assertions are the ones that matter: the research reached the post, and the art is ready for review.

- [ ] **Step 2: Run the whole suite**

```bash
cd apps/web && pnpm test && pnpm test:db
```

Expected: PASS for both, with no skipped tests.

- [ ] **Step 3: Typecheck and lint**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
```

Expected: PASS for both.

- [ ] **Step 4: Verify the UI is unregressed**

Start the dev server via the preview tooling and walk the wizard end to end: account → style → template → topic → generate → edit a slot → Review → clearance badge → schedule modal (open it, do not submit). Confirm no console errors and no failed network requests. Screenshot the Review screen.

This is the second half of the gate from Task 4: the extraction was verified before the MCP code existed, and this confirms nothing since then broke it.

- [ ] **Step 5: Verify a real client can connect**

With the dev server running and a token minted in Settings, confirm the endpoint answers a discovery call:

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'Content-Type: application/json' -H "Authorization: Bearer $STUDIO_TOKEN" -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}' | head -40
```

Expected: a result containing `supportedVersions`, `capabilities`, and the `instructions` string. Report the output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/studio/__tests__/morning-run.itest.ts
git commit -m "Prove the morning run end to end

Drives the route handler over real Requests through the whole sequence, then
asserts the two things that would silently not happen: that the research
reached the stored post, and that the art is rendered and waiting. It also
asserts the post is still a draft — the surface must not be able to publish."
```

---

## Verification Summary

Before claiming this plan complete, all of the following must have been run and passed:

| Check | Command |
|---|---|
| Unit tests | `cd apps/web && pnpm test` |
| DB-backed tests | `cd apps/web && pnpm test:db` |
| Types | `cd apps/web && pnpm exec tsc --noEmit` |
| Lint | `cd apps/web && pnpm lint` |
| Wizard unregressed | Browser walk-through, Task 13 Step 4 |
| Endpoint answers a real client | `curl` in Task 13 Step 5 |
| Revoked token is dead | `curl` in Task 11 Step 6 |

## Deferred, deliberately

- A `publish` scope and `schedule_post` tool.
- Migrating the job tools to the `io.modelcontextprotocol/tasks` extension.
- A durable per-account cultural calendar, so the agent stops re-researching fixed holidays.
- OAuth, if a client's connector UI cannot set a header.
