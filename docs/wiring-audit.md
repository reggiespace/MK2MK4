# Create-flow wiring audit

Branch: `claude/social-studio-saas-refactor-ivhqff`
Scope: audited against the handoff brief — "pick template → pick topic → fill the template's slots (from the manifest) using the Assets library, fal.ai and ElevenLabs → produce caption + first-comment + hashtags → Review → schedule."

Audit only. No source files were changed. `apps/web/src/lib/ai/**`, `apps/web/src/components/slide/**` and `apps/web/src/lib/templates/theme.ts` were being edited concurrently by other agents; they are judged on overall structure, not transient state.

---

## Summary

| # | Item | Status | One-line evidence |
|---|------|--------|-------------------|
| 1 | Render a template from its manifest inside Create | **Complete** | `FillStep.tsx:437` draws `<Slide slide={slide} …>` from the generated doc; slot list/limits come from `getManifest(style)` (`FillStep.tsx:74`, `SlotEditor.tsx:67-68`). |
| 2 | Fill step driven by slot manifest | **Partial** | Every text/area/pair/list/quiz/image slot renders with its budget (`SlotEditor.tsx:116-392`), but **logo auto-placement does not exist** and the `imagePrompt` pre-fill only works on `photo` templates. |
| 3 | fal.ai integration | **Partial** | Still-image generate + auto-save to Assets is fully wired (`lib/ai/fal.ts:78-123`). **Animation / image-to-video is entirely absent** — no model, no endpoint, no UI. |
| 4 | ElevenLabs integration | **Partial** | Voice picker, verbatim/condensed toggle, script assembly and audio preview all work (`VoiceEditor.tsx`, `lib/ai/voice.ts`). But the narration **never reaches a published artifact** — `enqueueReelRender` is dead code. |
| 5 | postDelivery assembly | **Complete** | `lib/ai/generate.ts:175-187` drafts caption/first/hashtags; `PostEditor.tsx` edits them; `ReviewStep.tsx:216-243` previews them; `publish.ts:127-136` ships them (incl. first comment) to the publisher. |
| 6 | Assets → fill wiring | **Partial** | Library picker works end to end (`ImagePicker.tsx:35-43` → `listAssetsAction` → `applyPickedAsset`), but **nothing can be uploaded into the library**, and the logo/brand-default half of the item is not implemented at all. |
| C1 | On-slide copy engagement-only; download CTA only in postDelivery | **Complete** | Enforced in the prompt (`generate.ts:49-51`) and structurally: `Slide.tsx` never reads `doc.caption`/`doc.first`/`doc.linkSticker`, and never draws `linkUrl`/`postRef`. |
| C2 | Accent guardrail built in, no per-slide hand-tuning | **Partial** | `safeOn()` exists and is correct (`theme.ts:61-73`) but is applied at only **3 of ~25 call sites** in `Slide.tsx` (lines 291, 332, 790). Most slides use the raw `acc`. |
| C3 | Reels on-screen text = voice script; `voiceScript` per frame | **Complete** | All six reel kinds declare `s("voiceScript", "area", …, 1, …)` (`manifests.ts:189-249`); `validateDoc` blocks publish if any is empty (`doc.ts:194`). |
| C4 | Story frames carry exactly one interactive sticker | **Partial** | Every story kind declares a `sticker` (`manifests.ts:290-346`), so it holds by construction — but `TemplateKind.sticker` is **never read by any code**, nothing validates it, and `1e-countdown` declares two (`"countdown+link"`). |
| S | Settings exposes key fields for all five providers | **Complete (6, not 5)** | `PROVIDER_META` (`SettingsClient.tsx:54-61`) has postiz, buffer, zernio, openai, fal, elevenlabs; each renders an API-key input at `SettingsClient.tsx:409-414`. |

---

## Gaps

### Gap 1 — Logo auto-placement does not exist (blocks items 2 and 6)

**What's actually there:** `BrandAccount.logoAssetId` + the `BrandLogo` relation exist in the schema (`apps/web/prisma/schema.prisma:125-126`), and `lib/workspace.ts:20,31` eagerly includes `logoAsset: true` on every account read. That is the entire implementation.

**What's missing — all three legs:**

1. **The renderer cannot draw a logo.** `SlideContext` (`apps/web/src/components/slide/Slide.tsx:19-26`) carries only `style, accent, brand, handle, initials`. There is no `logoUrl`. Every "brand mark" in the renderer is a coloured square containing the account monogram — e.g. reel (`Slide.tsx:590-606`), story top bar (`Slide.tsx:756-771`), photo chip (`Slide.tsx:1041-1060`). A grep for `logo` across `apps/web/src` returns only `logoutAction`, the asset-kind filter strings, and manifest prose.
2. **No UI sets it.** Settings has exactly four sections — `SECTIONS` at `SettingsClient.tsx:47-52` is `integrations | channels | voice | pillars`. There is no brand-assets section, and `app/actions/settings.ts` has no action that writes `logoAssetId`.
3. **Nothing populates the context.** `app/(app)/create/page.tsx:20-33` maps accounts into `WizardAccount` and omits `logoAsset` entirely; `components/create/types.ts:11-21` has no logo field. The export route builds `ctx` the same way (`app/render/slide/page.tsx:63-69`).

**Overstated claim to correct:** `manifests.ts:434` tells the model "Logo auto-places from the brand default." Nothing auto-places. That line is aspirational.

**Files that would need to change:**
- `apps/web/src/components/slide/Slide.tsx` — add `logoUrl?: string` to `SlideContext`; render `<img>` in place of the monogram inside `brandChip` / `topbar` / photo `chip`, and add a mark to the carousel `2f-cta` / reel `1f-cta` end cards.
- `apps/web/src/components/create/types.ts` — add `logoUrl: string | null` to `WizardAccount`.
- `apps/web/src/app/(app)/create/page.tsx` and `apps/web/src/app/render/slide/page.tsx` — pass `account.logoAsset?.url ?? null` into `ctx` (the include already exists in `workspace.ts`, and `render/slide/page.tsx:29` would need `include: { account: { include: { logoAsset: true } } }`).
- `apps/web/src/components/settings/SettingsClient.tsx` + `apps/web/src/app/actions/settings.ts` — a "Brand assets" section with a `setBrandLogoAction(accountId, assetId)` picking from `kind: "logo"` assets.
- `apps/web/src/components/create/steps/TemplateStep.tsx` / `ReviewStep.tsx` — pass the same `logoUrl` so the miniatures and Review card match.

**Recommended fix:** smallest correct version is `SlideContext.logoUrl`, consumed by the three existing brand-mark blocks with a monogram fallback when null, plus a logo picker in Settings that writes `logoAssetId`. Do not add logo placement per template kind — the mark positions already exist, they just draw initials.

---

### Gap 2 — fal.ai "animation" (image-to-video) is not implemented

**What's there:** `apps/web/src/lib/ai/fal.ts` exports exactly one function, `generateImage`. It POSTs to `https://queue.fal.run/${env.falImageModel()}` with `{prompt, image_size, num_images: 1}`, polls the queue, downloads the result off fal's CDN, stores it via `saveAsset`, and creates an `Asset` row with `ai: true` and the prompt retained (`fal.ts:105-120`). That part is solid and genuinely reusable.

**What's missing:** there is no video model, no `image_to_video` / `i2v` call, no `FAL_VIDEO_MODEL` env var (`lib/env.ts` has only `falImageModel`), no server action, and no UI. `ImagePicker.tsx` offers a prompt box and one "Generate image" button (`ImagePicker.tsx:139-176`) — no animate option. Both buttons in `SlotEditor.tsx` ("Library" at line 170 and "Generate" at line 190) call the identical `onOpenPicker(slot.id)`; they are cosmetically distinct and functionally the same.

**Is the worker's ffmpeg ken-burns a substitute? No — it is a different thing.** `apps/worker/app/renderer/reel.py:85-89` applies `zoompan=z='min(zoom+0.0015,1.05)'` plus `xfade` cross-fades to *already-rendered slide screenshots*. That is slideshow motion over static template art. fal.ai animation would produce a moving image *asset* that fills an image slot. They operate at different layers and neither substitutes for the other. Treating the ken-burns as "animation delivered" would be a misread.

**Worse: the ken-burns path is unreachable anyway.** `enqueueReelRender` (`apps/web/src/lib/render.ts:107-145`) is defined and exported but has **zero callers** — `grep -rn "enqueueReelRender" apps/web/src` returns only the definition. `publishPostAction` unconditionally calls `renderSlides` (`publish.ts:89`) regardless of `post.style`. So publishing a Reel today ships a set of still PNGs, not an MP4.

**Files that would need to change:**
- For animation: `apps/web/src/lib/env.ts` (add `falVideoModel`), `apps/web/src/lib/ai/fal.ts` (add `animateImage({assetId|imageUrl, prompt})` returning an `Asset` with `kind: "video"`), `apps/web/src/app/actions/create.ts` (an `animateImageAction`), `apps/web/src/components/create/ImagePicker.tsx` (a second action + generating state), and `apps/web/src/components/slide/Slide.tsx`'s `ImgFill` (`Slide.tsx:81-134`) to render `<video>` for video-kind values.
- For the reel MP4 path: `apps/web/src/app/actions/publish.ts:86-91` — branch on `style === "reel"` to `enqueueReelRender` and await the callback, instead of always `renderSlides`.

**Recommended fix:** the reel-render branch is the higher-value, lower-cost fix and should land first — the worker, the callback route (`app/api/worker/callback/route.ts:79-88` already handles a `kind: "video"` asset superseding frames) and `enqueueReelRender` are all built and tested-looking; only the call site is missing. Ship fal animation second, as a genuinely new capability.

---

### Gap 3 — `imagePrompt` pre-fill only works on Photo templates

`StudioWizard.tsx:466-468` passes:

```
initialPrompt={ doc ? asText(doc.slides[activeSlide]?.f.imagePrompt) : "" }
```

`imagePrompt` is declared on exactly four kinds, all in the `photo` manifest — `1a-lifestyle`, `1b-fieldnote`, `1c-split`, `1d-photoquote` (`manifests.ts:444, 456, 468, 481`). Every other image slot in the codebase has no sibling `imagePrompt`:

- carousel `2d-image` → `manifests.ts:130`
- reel `1a-statement` / `1d-title` / `1e-caption` → `manifests.ts:188, 224, 235`
- story `1a-poll` → `manifests.ts:296`

For all six of those, `asText(undefined)` returns `""`, the fal prompt box opens empty, and the Generate button is disabled until the user types something (`ImagePicker.tsx:141`). So the "prompt field = the `imagePrompt` slot" wiring is real but reaches only one of five template families.

Secondary defect: the prompt the user types in `ImagePicker` is local state (`ImagePicker.tsx:29`) and is never written back into the `imagePrompt` slot, so even on Photo templates a hand-edited prompt is lost on close.

**Files:** `apps/web/src/lib/templates/manifests.ts` (add an `imagePrompt` area slot beside each remaining `image` slot), or alternatively `StudioWizard.tsx` (derive a fallback prompt from topic + slide copy when the slot is absent), plus `ImagePicker.tsx` + `StudioWizard.applyPickedAsset` to persist the prompt back.

**Recommended fix:** add `s("imagePrompt", "area", 200, 0, "fal.ai prompt")` to the five non-photo image kinds — it costs nothing (the slot is optional, `generatableSlots` already includes `area` slots so the AI will draft the prompt for free) and makes the wiring uniform. Then have `applyPickedAsset` also write the prompt into that slot.

---

### Gap 4 — Nothing can be uploaded into the Assets library (blocks item 6)

The Assets page (`apps/web/src/app/(app)/assets/page.tsx`) is read-only: it renders a kind filter (`page.tsx:20`) and a grid, with no file input, no drop zone, no form. A repo-wide grep for `FormData` in `apps/web/src` hits only `actions/auth.ts` (login). `saveAsset` (`lib/storage.ts:38`) has exactly three callers: `lib/ai/fal.ts:102`, `lib/ai/voice.ts:103`, and the worker.

Consequence: the only rows that can ever exist in `Asset` are fal-generated photos, ElevenLabs audio, and worker render output. `apps/web/prisma/seed.ts` creates no assets (grep for `asset` in it returns nothing). So:

- The library-pick path in `ImagePicker` is correctly wired but, on a fresh install, can only ever show AI-generated images — its own empty state says as much (`ImagePicker.tsx:289-291`).
- `listAssetsAction` filters `kind: { in: ["photo", "screen", "logo"] }` (`actions/create.ts:216`), so Logos and Screenshots are already queried for — there is simply no way for one to exist.
- The brief's "Photo/Lifestyle + logo placement pull from the library" therefore cannot be satisfied end to end.

The page's own docstring — "The asset library — uploads plus everything fal.ai and the renderer produced" (`assets/page.tsx:5`) — overstates: there are no uploads.

**Files:** `apps/web/src/app/(app)/assets/page.tsx` (an upload control), a new `uploadAssetAction` in `apps/web/src/app/actions/create.ts` or a route handler (server actions accept `FormData`, so `lib/storage.ts:saveAsset` can be reused directly), and a kind selector so a logo can be tagged `logo`.

**Recommended fix:** one `uploadAssetAction(formData)` that validates mime type, calls `saveAsset`, and creates the `Asset` row with `ai: false` and the caller-chosen `kind`. Also add a kind filter to `ImagePicker` so a logo doesn't appear as a candidate background — right now it lists everything `listAssetsAction` returns, unfiltered (`ImagePicker.tsx:208`).

---

### Gap 5 — Voice settings only persist if you press Preview

`voiceId` and `narration` live in `StudioWizard` state (`StudioWizard.tsx:60-61`) and are written to the `Post` row in exactly one place: `synthesizeVoiceAction` (`actions/create.ts:305-308`). `saveDraftAction` (`actions/create.ts:176-195`) persists only `doc`, `caption`, `firstComment`, `hashtags`.

So a user who picks the Nova voice and "condensed", then goes straight to Review and schedules, gets a `Post` with `voiceId = null` and `voiceAssetId = null`. Combined with Gap 2 (`enqueueReelRender` unreachable) this is currently moot, but it becomes a live bug the moment the reel path is connected.

Adjacent inconsistency: `lib/env.ts:33-36` declares four voice env vars (`ELEVENLABS_VOICE_ID_BR_MALE/BR_FEMALE/US_MALE/US_FEMALE`) and `integrationStatus()` reports on them, but `lib/ai/voices.ts:9-13` hard-codes three unrelated public voice IDs (Aria/Sage/Nova) and is the only list the UI ever shows. The env vars are dead. Also, the voice list is not locale-aware even though `BrandAccount.locale` supports `pt_BR`.

**Files:** `apps/web/src/app/actions/create.ts` (extend `saveDraftAction` to take/persist `voiceId` + `narration`), `apps/web/src/components/create/StudioWizard.tsx:84-93` (include them in the debounced autosave), and `apps/web/src/lib/ai/voices.ts` (source from env, or delete the unused env vars).

---

### Gap 6 — Accent guardrail is present but barely applied (convention C2)

`safeOn(accent, bg, min = 2.2)` in `apps/web/src/lib/templates/theme.ts:61-73` is correct: WCAG relative luminance, real contrast ratio, ordered fallback list. But `Slide.tsx` imports it and calls it at only three sites — `Slide.tsx:291` (`1c-bigstat`/`1a-stat`), `Slide.tsx:332`, and `Slide.tsx:790` (story `1a-poll` kicker). Every other accent use is the raw `const acc = ctx.accent` (`Slide.tsx:190`), including high-risk cases: the `2e-myth` "Fact" card fills its whole background with `acc` and puts `#fff` text on it (`Slide.tsx:513-516`), the story quiz marks the correct answer with `background: acc, color: "#fff"` (`Slide.tsx:869-870`), and the countdown link button uses `background: acc, color: "#141a24"` (`Slide.tsx:915-921`).

The claim "any brand accent is safe, no per-slide hand-tuning" is therefore **not yet true** — a pale brand accent produces white-on-pale text in at least three layouts.

Note: `Slide.tsx` and `theme.ts` are both in the concurrent-edit zone, so this may be actively being addressed. Verify before acting.

**Files:** `apps/web/src/components/slide/Slide.tsx` — replace `acc` with a `safeOn`-derived value at each usage; the cleanest form is to compute `const acc = safeOn(ctx.accent, g.base)` once at `Slide.tsx:190` and keep the raw value only where the accent is a *background* (in which case the *foreground* needs the guard instead).

---

### Gap 7 — Two smaller manifest/prompt defects worth fixing

1. **`≤ 0 chars` in the prompt.** `describeSlots` emits `` `≤ ${s.max} chars` `` for plain text slots (`lib/ai/schema.ts:118`). Slots declared with `max: 0` to mean "unbounded" — story `targetTime`, `linkUrl` (`manifests.ts:336, 338`) and `postRef` (`manifests.ts:347`) — are therefore described to the model as "≤ 0 chars, required". All three are `required: true`, so `validateDoc` (`doc.ts:194`) blocks publish if the model complies with the instruction. Fix in `schema.ts:118`: emit "no limit" when `s.max <= 0`. `fitToBudget` already treats `max <= 0` as unbounded (`schema.ts:94`) — only the description is wrong.
2. **`kind.sticker` is inert.** Declared in `types.ts:50`, populated for all six story kinds, read by nothing. `validateDoc` has no story-specific check. Convention C4 holds only because every story kind happens to declare one — and `1e-countdown` declares `"countdown+link"`, which is two stickers. If the "exactly one" rule matters, add a story branch to `validateDoc` in `apps/web/src/lib/templates/doc.ts` and surface `kind.sticker` in the Slots tab header so the user can see which tap target a frame carries.

---

## Verified working — what I actually traced end to end

These were followed UI → server action → library → persistence, not assumed from the presence of a function.

**Manifest-driven render inside Create (item 1).** `TemplateStep.tsx:71` draws each cover archetype with the real `<Slide>` and `sampleSlide()` copy — a live miniature, not an icon. After generation, `FillStep.tsx:436-438` renders the actual doc through the same component, and `ReviewStep.tsx:187-189` and `app/render/slide/page.tsx:71-81` use it again at Review and at export. One renderer, four surfaces, confirmed.

**Manifest-driven fill form (item 2, copy half).** `SlotEditor.tsx:116` iterates `kind.slots` from `getManifest(style).kinds[slide.kind]`. `text`/`area` get inputs with a live `n/max` counter that turns red over budget (`SlotEditor.tsx:32-49, 369-389`); `pair`/`quiz`/`list` get add/remove rows honouring `min`/`maxItems` (`SlotEditor.tsx:215-365`); `quiz` enforces single-correct on click (`SlotEditor.tsx:236`). I checked reachability of every `image` slot in every manifest: carousel `2d-image` and reel `1d`/`1e` are in `defaultSequence` and in the Add-slide menu (`FillStep.tsx:543-564`); reel `1a-statement`, story `1a-poll` and all four photo kinds are covers reachable via the cover-swap chips (`SlotEditor.tsx:90-110`). All are fillable.

**fal.ai still-image round trip (item 3, image half).** `ImagePicker.generate()` → `generateImageAction` → `ownedAccount` auth check → `generateImage` → `requireCredential(workspaceId, Provider.fal)` → queue submit/poll/fetch → download off fal's CDN → `saveAsset` → `prisma.asset.create({ai: true, prompt})` → returns a `LibraryAsset` → `onPick` → `applyPickedAsset` writes `{id,name,url,ai}` into the slide slot (`StudioWizard.tsx:201-210`) → the debounced `saveDraftAction` persists it (`StudioWizard.tsx:84-93`). Generating state is real (`ImagePicker.tsx:156-169`), and the asset genuinely reappears in the library on the next open. Regenerating the draft preserves already-picked images (`generate.ts:161-168`).

**ElevenLabs script + preview (item 4, preview half).** `assembleScript` walks the doc in frame order, reads `voiceScript` where the kind declares it, and falls back to `prompt`/`headline`/`caption` for Stories (`voice.ts:29-57`); `condensed` truncates to the first sentence. `previewScriptAction` refreshes the line list on every doc change via `docVersion` (`VoiceEditor.tsx:38-49`). `synthesizeVoiceAction` → `requireCredential(…, Provider.elevenlabs)` → TTS POST → `saveAsset` → `Asset{kind:"audio"}` → `Post.voiceAssetId` → the returned URL is played in-browser (`VoiceEditor.tsx:75-79`). The read plays. It just never reaches a published file.

**postDelivery assembly (item 5).** Fully traced. The system prompt carries the CTA convention verbatim (`generate.ts:49-51`); the user prompt asks for `caption` (soft "→ link in bio"), `firstComment` (the real URL, interpolated from `BrandAccount.downloadUrl`) and 5–10 sub-100K hashtags (`generate.ts:76-81`). `draftSchema` makes all three required except for Stories (`schema.ts:78-83`). `fitToBudget` re-imposes the caption budgets on the way back. All three are editable in `PostEditor.tsx` with a live caption counter, previewed in the Review card (`ReviewStep.tsx:224-241`), gated by `checkDraftAction`/`validateDoc`, and passed to the publisher at `publish.ts:127-136` — where `firstComment` is honoured by all three adapters (`postiz.ts:112-113`, `buffer.ts:69-71`, `zernio.ts:66`).

**The CTA convention is structurally safe (C1).** I looked specifically for a path that could put a download URL on a slide and found none. `Slide` receives only `{slide, index, total, ctx}` (`Slide.tsx:28-33`) — it has no access to `doc.caption`, `doc.first` or `doc.linkSticker`. `generateDraft` writes `linkSticker: brand.downloadUrl` at the *doc* level only (`generate.ts:185`). Story `1e-countdown` stores a `linkUrl` in its slot, but the renderer draws only `linkLabel` (`Slide.tsx:913-923`) — the URL is never painted. `1f-reshare`'s `postRef` is likewise unread. The end cards draw "Save ⤓" and the follow line (`Slide.tsx:558-572`). Convention holds.

**Reel `voiceScript` guarantee (C3).** Verified per kind, not assumed: `1a-statement` (`manifests.ts:189`), `1b-question` (200), `1c-kinetic` (212), `1d-title` (225), `1e-caption` (236), `1f-cta` (248) — all six declare `voiceScript` as `required`. `validateDoc` flags a missing one and `publishPostAction:57-65` refuses to publish. Guaranteed.

**Settings provider count (S).** Counted, not assumed: six cards render, each with an API-key input. `providerSchema` in `actions/settings.ts:20-27` accepts the same six; `listIntegrationStatus` (`integrations.ts:99-127`) returns `[postiz, buffer, zernio] + [fal, elevenlabs, openai]`. All five required by the brief are present, plus OpenAI. Publishing providers additionally get a base-URL field (`SettingsClient.tsx:415-422`); AI providers correctly fall back to platform keys and show "using platform key" state. The brief's claim is met and slightly exceeded.

**Publish path.** `publishPostAction` re-checks ownership, runs `validateDoc` as a hard gate, requires linked channel `externalId`s, renders through `renderSlides` if `mediaUrls` is empty, resolves the active publisher, and writes one `ScheduledPost` per channel with an idempotency key of `postId:channelId:when` that short-circuits a resend (`publish.ts:104-111`). This is genuinely solid — with the one caveat that Reels take the still-frame path (Gap 2).

---

## Blunt summary

Four of six items are real work that functions. What is overstated:

- **"Logo auto-places from the brand default"** (`manifests.ts:434`) — nothing auto-places. There is a database column and an eager-loaded relation that no code consumes. Items 2 and 6 are incomplete for this reason.
- **"fal.ai (images/animation)"** — images yes, animation no. The worker's ken-burns is slideshow motion applied to rendered slide screenshots; it is not image-to-video and does not substitute for it. And the ken-burns path is dead code anyway: `enqueueReelRender` has no callers, so publishing a Reel today emits still PNGs.
- **"The asset library — uploads plus…"** (`assets/page.tsx:5`) — there is no upload anywhere in the app. Logos and Screenshots are queried for but can never exist.
- **"Accent guardrail is built in; any brand accent is safe"** — the function is correct and applied at 3 of ~25 accent uses. A pale accent still produces illegible slides.
- **ElevenLabs is a working preview feature, not a working delivery feature.** The read plays in the browser and the mp3 is stored, but it is never muxed into anything that publishes.
