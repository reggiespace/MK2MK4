# Edit existing drafts

## Problem

Drafts are permanently read-only once a user leaves the Create wizard. `/pieces/[id]` renders a `Post`'s slides, caption, and schedule with zero interactivity — no edit button, no image-regenerate control. The wizard (`StudioWizard`) fully implements editing (`FillStep`, `ImagePicker`, debounced autosave via `saveDraftAction`) and image regeneration (`generateImageAction`), but only ever operates on a `postId` that it itself created during a live session — `/create` never accepts an existing draft's ID, so there's no way to reopen one.

This is a known gap in the original design (the Create-flow handoff doc scoped editing to the wizard's Fill step only), not a regression. Draft editing and image regeneration are fully implemented; they just have no re-entry point once you leave the session that created them.

## Goal

Let a user reopen an existing **draft** (`status: "draft"` only — review/scheduled/published/failed stay read-only) from `/pieces/[id]` and continue editing it — including regenerating slide images — using the existing wizard machinery. No new editor, no new mutation surface.

## Design

### Architecture

Reuse the wizard via a resume path instead of building a second editor:

1. `/pieces/[id]` shows an **Edit draft** link next to the status pill, only when `post.status === "draft"`, pointing to `/create?postId=<id>`.
2. `/create` reads the `postId` query param. If it resolves to a `Post` in the current workspace with `status: "draft"`, the server loads it and passes it to `StudioWizard` as an `initialDraft` prop. Otherwise (missing, wrong workspace, not a draft), the param is ignored and a normal fresh wizard renders — no error state.
3. `StudioWizard` seeds its client state from `initialDraft` once on mount and jumps straight to the **Create** step (index 4, the Fill step) with `maxStep` set to 5, so **Review** is also reachable. Every downstream mechanism — the debounced autosave effect keyed on `postId`+`doc`, `ImagePicker` → `generateImageAction`, `ReviewStep` → `publishPostAction` — already operates purely off `postId`/`doc` state and needs no changes.

### Components touched

- **`apps/web/src/app/(app)/pieces/[id]/page.tsx`**
  Add an `<Link href={`/create?postId=${post.id}`}>Edit draft</Link>` next to the existing status pill (line ~44), rendered only when `post.status === "draft"`.

- **`apps/web/src/app/(app)/create/page.tsx`**
  Accept `props: { searchParams: Promise<{ postId?: string }> }`. If `postId` is present, query:
  ```
  prisma.post.findFirst({
    where: { id: postId, workspaceId: auth.workspaceId, status: "draft" },
  })
  ```
  On a hit, build an `initialDraft` object (see Data flow) and pass it to `<StudioWizard initialDraft={...} />`. On a miss, pass nothing — existing fresh-wizard behavior is unchanged.

- **`apps/web/src/components/create/StudioWizard.tsx`**
  Add an optional prop:
  ```ts
  initialDraft?: {
    postId: string;
    accountId: string;
    style: TemplateStyleId;
    archetype: string;
    topic: string;
    pillarId: string | null;
    doc: PostDoc;
    voiceId: string | null;
    narration: "verbatim" | "condensed";
  }
  ```
  When present, initialize state once (lazy `useState` initializers, no extra effect needed since these are only ever set from props at mount): `accountId`, `style`, `arch` (from `archetype`), `topic`, `pillar` (from `pillarId`), `postId`, `doc`, `docVersion` bumped, `voiceId`, `narration`, `step` = 4, `maxStep` = 5. `channels` keeps its existing default (all channels for the account) since a draft's target channels aren't separately persisted pre-schedule.

### Data flow

```
/pieces/[id]  (status: draft)
   -> click "Edit draft"
   -> /create?postId=X
   -> CreatePage (server): prisma.post.findFirst({ id: X, workspaceId, status: "draft" })
   -> StudioWizard seeds state from initialDraft, opens on Fill step
   -> user edits captions/hashtags/images (FillStep, ImagePicker)
   -> existing debounced effect: saveDraftAction(postId, doc)   [unchanged]
   -> user regenerates an image: generateImageAction(...)      [unchanged]
   -> user proceeds to Review -> publishPostAction              [unchanged]
```

No new server actions, API routes, or schema changes.

### Error handling

- `postId` missing, belongs to another workspace, or resolves to a non-draft `Post`: ignored silently, fresh wizard renders. This avoids both a confusing error page and leaking cross-workspace post existence via response-time/404 differences.
- All other error handling (failed generation, failed image regen, publish errors) is already implemented in the wizard and is unchanged.

### Out of scope

- Editing review/scheduled/published/failed posts — only `draft` gets the entry point.
- A lighter inline editor on `/pieces/[id]` itself — rejected in favor of reusing the wizard (see brainstorming discussion).
- Persisting per-draft channel selection separately from the account's channel list.

## Testing (manual)

1. Create a draft, leave the wizard (navigate to `/pieces`), open its detail page — confirm "Edit draft" link appears since `status === "draft"`.
2. Click it — confirm the wizard opens on the Fill step with existing slides/caption/hashtags populated correctly.
3. Regenerate an image via `ImagePicker` — confirm it updates and autosaves (refresh `/pieces/[id]` after a couple seconds and confirm the change persisted).
4. Confirm a non-draft post's detail page shows no Edit link.
5. Manually hit `/create?postId=<a published or another workspace's post id>` — confirm it silently falls back to a fresh wizard, no error, no leaked data.
