# Edit Existing Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user reopen an existing `draft` post from `/pieces/[id]` and continue editing it — including regenerating slide images — by resuming the existing Create wizard instead of building a new editor.

**Architecture:** `/pieces/[id]` gets an "Edit draft" link (shown only for `status: "draft"`) to `/create?postId=<id>`. `/create/page.tsx` loads that `Post` (scoped to the workspace, only if still a draft) and maps it to an `InitialDraft` object via a small pure helper. `StudioWizard` accepts that object as an optional prop and seeds its state from it at mount, landing on the Fill step (index 4) with Review (index 5) unlocked and `genPhase` already `"done"`. Autosave, image regeneration, and publish all already key off `postId`/`doc` state and need no changes.

**Tech Stack:** Next.js (App Router, async `params`/`searchParams`), React client component state, Prisma 7, Vitest (`node` environment, no DOM/component testing library in this repo — component and page changes are verified manually, not via automated component tests).

## Global Constraints

- Only `status: "draft"` posts get an edit entry point; review/scheduled/published/failed stay read-only (per spec).
- No new server actions, API routes, or Prisma schema changes — reuse `generateDraftAction`, `saveDraftAction`, `generateImageAction` exactly as they exist today.
- If `postId` is missing, cross-workspace, or not a draft, `/create` must silently fall back to a fresh wizard — no error banner, no leaked existence of other posts.
- Follow existing code style in this codebase: inline `style={{...}}` objects (no CSS modules/Tailwind), `"use client"`/`"use server"` directives exactly where already used, existing `Icon` component for icons (no new icon assets).

---

### Task 1: `InitialDraft` type + pure mapping helper

**Files:**
- Modify: `apps/web/src/components/create/types.ts`
- Create: `apps/web/src/lib/create/resolve-draft.ts`
- Test: `apps/web/src/lib/create/__tests__/resolve-draft.test.ts`

**Interfaces:**
- Produces: `InitialDraft` type (exported from `@/components/create/types`) and `toInitialDraft(post, pillarName)` (exported from `@/lib/create/resolve-draft`) — both consumed by Task 2 (`create/page.tsx`) and Task 3 (`StudioWizard`).
  ```ts
  export interface InitialDraft {
    postId: string;
    accountId: string;
    style: TemplateStyleId;
    archetype: string;
    topic: string;
    pillar: string | null;
    doc: PostDoc;
    voiceId: string;
    narration: "verbatim" | "condensed";
  }

  function toInitialDraft(
    post: {
      id: string;
      accountId: string;
      style: string;
      archetype: string;
      topic: string | null;
      doc: unknown;
      voiceId: string | null;
      narration: "verbatim" | "condensed";
    },
    pillarName: string | null,
  ): InitialDraft
  ```

- [ ] **Step 1: Add the `InitialDraft` type to `types.ts`**

Edit `apps/web/src/components/create/types.ts`, appending after the existing `WizardState` interface:

```ts
/** Seeds StudioWizard's state when reopening an existing draft from /pieces. */
export interface InitialDraft {
  postId: string;
  accountId: string;
  style: TemplateStyleId;
  archetype: string;
  topic: string;
  pillar: string | null;
  doc: PostDoc;
  voiceId: string;
  narration: "verbatim" | "condensed";
}
```

- [ ] **Step 2: Write the failing test for `toInitialDraft`**

Create `apps/web/src/lib/create/__tests__/resolve-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toInitialDraft } from "../resolve-draft";
import type { PostDoc } from "@/lib/templates/types";

const doc: PostDoc = {
  slides: [{ kind: "1a-knockout", f: {} }],
  caption: "hello",
  first: "",
  hashtags: ["#gastriciq"],
};

describe("toInitialDraft", () => {
  it("maps a Post row + pillar name into an InitialDraft", () => {
    const result = toInitialDraft(
      {
        id: "post_1",
        accountId: "acct_1",
        style: "carousel",
        archetype: "1a-knockout",
        topic: "Protein tips",
        doc,
        voiceId: "voice_x",
        narration: "condensed",
      },
      "Nutrition",
    );

    expect(result).toEqual({
      postId: "post_1",
      accountId: "acct_1",
      style: "carousel",
      archetype: "1a-knockout",
      topic: "Protein tips",
      pillar: "Nutrition",
      doc,
      voiceId: "voice_x",
      narration: "condensed",
    });
  });

  it("defaults topic to empty string and voiceId to DEFAULT_VOICE_ID when null", () => {
    const result = toInitialDraft(
      {
        id: "post_2",
        accountId: "acct_1",
        style: "story",
        archetype: "2a-quote",
        topic: null,
        doc,
        voiceId: null,
        narration: "verbatim",
      },
      null,
    );

    expect(result.topic).toBe("");
    expect(result.voiceId).toBe(DEFAULT_VOICE_ID);
    expect(result.pillar).toBeNull();
  });
});
```

Add the `DEFAULT_VOICE_ID` import at the top of the test file:

```ts
import { DEFAULT_VOICE_ID } from "@/lib/ai/voices";
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/create/__tests__/resolve-draft.test.ts`
Expected: FAIL — `Cannot find module '../resolve-draft'` (file doesn't exist yet).

- [ ] **Step 4: Implement `toInitialDraft`**

Create `apps/web/src/lib/create/resolve-draft.ts`:

```ts
import { DEFAULT_VOICE_ID } from "@/lib/ai/voices";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import type { InitialDraft } from "@/components/create/types";

/** Maps a saved `Post` row into the shape StudioWizard needs to resume editing it. */
export function toInitialDraft(
  post: {
    id: string;
    accountId: string;
    style: string;
    archetype: string;
    topic: string | null;
    doc: unknown;
    voiceId: string | null;
    narration: "verbatim" | "condensed";
  },
  pillarName: string | null,
): InitialDraft {
  return {
    postId: post.id,
    accountId: post.accountId,
    style: post.style as TemplateStyleId,
    archetype: post.archetype,
    topic: post.topic ?? "",
    pillar: pillarName,
    doc: post.doc as unknown as PostDoc,
    voiceId: post.voiceId ?? DEFAULT_VOICE_ID,
    narration: post.narration,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/create/__tests__/resolve-draft.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/create/types.ts apps/web/src/lib/create/resolve-draft.ts apps/web/src/lib/create/__tests__/resolve-draft.test.ts
git commit -m "feat: add InitialDraft type and toInitialDraft mapping helper"
```

---

### Task 2: Load the draft in `/create` and pass it to `StudioWizard`

**Files:**
- Modify: `apps/web/src/app/(app)/create/page.tsx`

**Interfaces:**
- Consumes: `toInitialDraft(post, pillarName): InitialDraft` and `InitialDraft` type from Task 1; `prisma` from `@/lib/db` (already used the same way in `apps/web/src/app/(app)/pieces/[id]/page.tsx:3,19-26`).
- Produces: `<StudioWizard initialDraft={initialDraft} ... />` prop, consumed by Task 3.

- [ ] **Step 1: Update `CreatePage` to read `postId` and load the draft**

Replace the full contents of `apps/web/src/app/(app)/create/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { StudioWizard } from "@/components/create/StudioWizard";
import { loadWorkspaceContext } from "@/lib/workspace";
import { activePublisher } from "@/lib/integrations";
import { prisma } from "@/lib/db";
import { toInitialDraft } from "@/lib/create/resolve-draft";
import type { InitialDraft } from "@/components/create/types";

const PROVIDER_LABEL: Record<string, string> = {
  postiz: "Postiz",
  buffer: "Buffer",
  zernio: "Zernio",
};

export default async function CreatePage(props: {
  searchParams: Promise<{ postId?: string }>;
}) {
  const { auth, accounts, account } = await loadWorkspaceContext();
  if (!account) redirect("/settings");

  const provider = await activePublisher(auth.workspaceId);

  const { postId } = await props.searchParams;
  let initialDraft: InitialDraft | undefined;
  if (postId) {
    // Only a still-editable draft in this workspace may seed the wizard;
    // anything else (missing, another workspace's, already scheduled) is
    // ignored silently so /create falls back to a normal fresh session.
    const draftPost = await prisma.post.findFirst({
      where: { id: postId, workspaceId: auth.workspaceId, status: "draft" },
      include: { pillar: true },
    });
    if (draftPost) {
      initialDraft = toInitialDraft(draftPost, draftPost.pillar?.name ?? null);
    }
  }

  return (
    <StudioWizard
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        locale: a.locale,
        handle: a.handle,
        initials: a.initials,
        mark: a.mark,
        accent: a.accent,
        logoUrl: a.logoAsset?.url ?? null,
        channels: a.channels.map((c) => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          externalId: c.externalId,
        })),
        pillars: a.pillars.map((p) => ({ id: p.id, name: p.name })),
      }))}
      initialAccountId={account.id}
      publisherName={provider ? (PROVIDER_LABEL[provider] ?? provider) : "no provider"}
      initialDraft={initialDraft}
    />
  );
}
```

- [ ] **Step 2: Verify the project type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: errors only about `StudioWizard` not yet accepting an `initialDraft` prop (fixed in Task 3) — no other new errors. If your editor/CLI reports exactly that one error and nothing else new, proceed; Task 3 clears it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/create/page.tsx
git commit -m "feat: load an existing draft post into /create via ?postId="
```

---

### Task 3: Seed `StudioWizard` state from `initialDraft`

**Files:**
- Modify: `apps/web/src/components/create/StudioWizard.tsx:34-70`

**Interfaces:**
- Consumes: `InitialDraft` type from Task 1 (`@/components/create/types`).
- Produces: `StudioWizard` now accepts an optional `initialDraft?: InitialDraft` prop; no changes to any other exported signature (`FillStep`, `ReviewStep`, `ImagePicker`, actions all unchanged, still driven by the same `postId`/`doc`/`style`/`arch` state).

- [ ] **Step 1: Add the prop and import**

In `apps/web/src/components/create/StudioWizard.tsx`, update the type import (line 25) and the component signature (lines 34-42):

```ts
import type { EditorTab, GenPhase, InitialDraft, WizardAccount } from "./types";
```

```ts
export function StudioWizard({
  accounts,
  initialAccountId,
  publisherName,
  initialDraft,
}: {
  accounts: WizardAccount[];
  initialAccountId: string;
  publisherName: string;
  initialDraft?: InitialDraft;
}) {
```

- [ ] **Step 2: Seed state from `initialDraft`**

Replace the state declarations block (lines 43-62) with:

```ts
  const [step, setStep] = useState(initialDraft ? 4 : 0);
  const [maxStep, setMaxStep] = useState(initialDraft ? 5 : 0);
  const [accountId, setAccountId] = useState(initialDraft?.accountId ?? initialAccountId);
  const [channels, setChannels] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.channels.map((c) => c.platform)])),
  );
  const [style, setStyle] = useState<TemplateStyleId | null>(initialDraft?.style ?? null);
  const [arch, setArch] = useState<string | null>(initialDraft?.archetype ?? null);
  const [topic, setTopic] = useState(initialDraft?.topic ?? "");
  const [pillar, setPillar] = useState<string | null>(initialDraft?.pillar ?? null);
  const [ideas, setIdeas] = useState<SuggestedIdea[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [genPhase, setGenPhase] = useState<GenPhase>(initialDraft ? "done" : "idle");
  const [postId, setPostId] = useState<string | null>(initialDraft?.postId ?? null);
  const [doc, setDoc] = useState<PostDoc | null>(initialDraft?.doc ?? null);
  const [docVersion, setDocVersion] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("slides");
  const [voiceId, setVoiceId] = useState<string>(initialDraft?.voiceId ?? DEFAULT_VOICE_ID);
  const [narration, setNarration] = useState<"verbatim" | "condensed">(initialDraft?.narration ?? "verbatim");
```

(All other state declarations — `when` through `pickerSlot` — are unchanged.)

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `cd apps/web && npx vitest run`
Expected: PASS — this component has no existing unit tests, so this only confirms the rest of the suite (lib tests) is unaffected.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS — no errors (this clears the error left over from Task 2).

- [ ] **Step 5: Manual smoke check**

Start the dev server and confirm both flows still work end-to-end:
1. `/create` with no `postId` — wizard opens on Account step as before (unaffected by this change).
2. `/create?postId=<id of an existing draft>` — wizard opens directly on the Fill step, with that draft's slides/caption/hashtags already populated, and the "Review" continue button enabled immediately.

(A draft's `id` can be read from its `/pieces/[id]` URL, or via `npx prisma studio` in `apps/web`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/create/StudioWizard.tsx
git commit -m "feat: seed StudioWizard from an existing draft, landing on Fill"
```

---

### Task 4: "Edit draft" link on the Pieces detail page

**Files:**
- Modify: `apps/web/src/app/(app)/pieces/[id]/page.tsx:36-50`

**Interfaces:**
- Consumes: nothing new — `post.status` and `post.id` are already loaded on this page (`apps/web/src/app/(app)/pieces/[id]/page.tsx:19-26`); links to the route built in Task 2.
- Produces: nothing consumed elsewhere — this is the final, leaf-level UI change.

- [ ] **Step 1: Add the link**

In `apps/web/src/app/(app)/pieces/[id]/page.tsx`, replace the top header `<div>` (lines 36-50) with:

```tsx
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <Link href="/pieces" style={{ ...kicker, display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <Icon name="chevL" size={13} strokeWidth={2.6} />
            Pieces
          </Link>
          <h1 style={display(30, 700, { margin: 0, lineHeight: 1.1 })}>{post.topic || man.label}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "9px" }}>
            <span style={statusPill(post.status)}>{post.status}</span>
            <span style={{ fontSize: "12.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              {man.label} · {doc.slides.length} {doc.slides.length === 1 ? "frame" : "frames"} · {post.account.name}
            </span>
          </div>
        </div>
        {post.status === "draft" ? (
          <Link
            href={`/create?postId=${post.id}`}
            className="hover-lift"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--accent)",
              color: "#f4efe0",
              borderRadius: "11px",
              padding: "11px 18px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icon name="arrowR" size={16} strokeWidth={2.4} />
            Edit draft
          </Link>
        ) : null}
      </div>
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual verification**

Start the dev server (or use the running one) and check:
1. Open a `draft`-status post's `/pieces/[id]` page — the "Edit draft" link appears next to the status pill, and clicking it opens `/create?postId=<id>` on the Fill step with the draft's content loaded (per Task 3's smoke check).
2. Open a non-draft post (e.g. one with `status: "scheduled"` or `"published"`) — confirm no "Edit draft" link is rendered.
3. In the wizard opened from step 1, use the image picker to regenerate a slide's image, then navigate back to `/pieces/[id]` for that post after a couple of seconds — confirm the new image persisted (autosave via `saveDraftAction` fired).
4. Manually navigate to `/create?postId=<a published or scheduled post's id>` — confirm it silently falls back to a fresh wizard (Account step), no error shown.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/pieces/[id]/page.tsx"
git commit -m "feat: add Edit draft link on the Pieces detail page for draft posts"
```

---

## Plan Self-Review

**Spec coverage:**
- Edit entry point only for `status: "draft"` → Task 4.
- `/create?postId=` loading, silent fallback on miss/wrong workspace/non-draft → Task 2.
- Wizard resumes on Fill step, Review reachable, no changes to autosave/image-regen/publish → Task 3.
- Pure mapping from `Post` row to wizard seed (needed because `pillar` is stored by name in wizard state but by `pillarId` on `Post`) → Task 1.
- Manual test plan from the spec's "Testing" section → covered across Task 3 Step 5 and Task 4 Step 3.

**Placeholder scan:** No TBD/TODO; every step has literal code or exact commands.

**Type consistency:** `InitialDraft` (Task 1) is the single shape threaded through `toInitialDraft` (Task 1) → `CreatePage` (Task 2) → `StudioWizard` (Task 3) unchanged. `narration`/`voiceId`/`pillar` field names and types match across all three.
