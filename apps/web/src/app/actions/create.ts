"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getAccount } from "@/lib/workspace";
import { generateDraft, type BrandVoice } from "@/lib/ai/generate";
import { suggestIdeas, type SuggestedIdea } from "@/lib/ai/ideas";
import { generateImage } from "@/lib/ai/fal";
import { assembleScript, estimateSeconds, synthesizeVoice } from "@/lib/ai/voice";
import { getManifest } from "@/lib/templates/manifests";
import { validateDoc } from "@/lib/templates/doc";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import type { Prisma } from "@/generated/prisma/client";
import type { Narration } from "@/generated/prisma/enums";

/**
 * Create-wizard server actions.
 *
 * Every action re-checks auth and re-scopes to the caller's workspace — server
 * functions are reachable by direct POST, not only through the wizard UI.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[create action]", err);
  return { ok: false, error: message };
}

/** Load a brand account the caller owns, or throw. */
async function ownedAccount(accountId: string) {
  const auth = await requireAuth();
  const account = await getAccount(auth.workspaceId, accountId);
  if (!account) throw new Error("Account not found.");
  return { auth, account };
}

function brandVoice(account: {
  name: string;
  handle: string;
  locale: string;
  voiceDescription: string;
  tones: string[];
  readingLevel: string;
  claimsGuardrail: boolean;
  downloadUrl: string | null;
}): BrandVoice {
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

/** Load a post the caller owns, or throw. */
async function ownedPost(postId: string) {
  const auth = await requireAuth();
  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId: auth.workspaceId },
    include: { account: true },
  });
  if (!post) throw new Error("Post not found.");
  return { auth, post };
}

// ---------------------------------------------------------------------------
// Step 4 — topic suggestions
// ---------------------------------------------------------------------------

export async function suggestTopicsAction(
  accountId: string,
  pillar: string | null,
): Promise<ActionResult<SuggestedIdea[]>> {
  try {
    const { auth, account } = await ownedAccount(accountId);
    const ideas = await suggestIdeas(auth.workspaceId, brandVoice(account), { pillar });

    // Keep them so the Dashboard's "suggested next" has something to draw on.
    const pillarRow = pillar ? account.pillars.find((p) => p.name === pillar) : undefined;
    await prisma.idea.createMany({
      data: ideas.map((i) => ({
        accountId: account.id,
        pillarId: pillarRow?.id ?? null,
        title: i.title,
        angle: i.angle,
        format: i.format,
      })),
    });

    return { ok: true, data: ideas };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Step 5 — generate the draft
// ---------------------------------------------------------------------------

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
  /** Set when regenerating an existing draft, so images survive. */
  postId?: string;
}): Promise<ActionResult<DraftPayload>> {
  try {
    const { auth, account } = await ownedAccount(input.accountId);
    const man = getManifest(input.style);
    if (!man.kinds[input.archetype]) throw new Error("Unknown template archetype.");
    if (!input.topic.trim()) throw new Error("Give the post a topic first.");

    // Regenerating keeps the current slide sequence; a fresh draft uses the
    // manifest's default sequence for the chosen archetype.
    let kinds = man.defaultSequence(input.archetype);
    let existing: PostDoc["slides"] | undefined;

    if (input.postId) {
      const { post } = await ownedPost(input.postId);
      const doc = post.doc as unknown as PostDoc;
      if (doc?.slides?.length) {
        kinds = doc.slides.map((s) => s.kind);
        existing = doc.slides;
      }
    }

    const doc = await generateDraft({
      workspaceId: auth.workspaceId,
      brand: brandVoice(account),
      style: input.style,
      kinds,
      topic: input.topic,
      pillar: input.pillar,
      existing,
    });

    const pillarRow = input.pillar ? account.pillars.find((p) => p.name === input.pillar) : undefined;
    const data = {
      workspaceId: auth.workspaceId,
      accountId: account.id,
      style: input.style,
      archetype: input.archetype,
      topic: input.topic,
      pillarId: pillarRow?.id ?? null,
      doc: doc as unknown as Prisma.InputJsonValue,
      caption: doc.caption,
      firstComment: doc.first,
      hashtags: doc.hashtags,
      status: "draft" as const,
    };

    const post = input.postId
      ? await prisma.post.update({ where: { id: input.postId }, data })
      : await prisma.post.create({ data });

    return { ok: true, data: { postId: post.id, doc } };
  } catch (err) {
    return fail(err);
  }
}

/** Persist wizard edits to the draft. */
export async function saveDraftAction(
  postId: string,
  doc: PostDoc,
): Promise<ActionResult<{ saved: true }>> {
  try {
    await ownedPost(postId);
    await prisma.post.update({
      where: { id: postId },
      data: {
        doc: doc as unknown as Prisma.InputJsonValue,
        caption: doc.caption,
        firstComment: doc.first,
        hashtags: doc.hashtags,
      },
    });
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Image slots — library + fal.ai
// ---------------------------------------------------------------------------

export interface LibraryAsset {
  id: string;
  name: string;
  url: string;
  kind: string;
  ai: boolean;
  meta: string;
}

export async function listAssetsAction(accountId: string): Promise<ActionResult<LibraryAsset[]>> {
  try {
    const { auth, account } = await ownedAccount(accountId);
    const assets = await prisma.asset.findMany({
      where: {
        workspaceId: auth.workspaceId,
        kind: { in: ["photo", "screen", "logo"] },
        OR: [{ accountId: account.id }, { accountId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return {
      ok: true,
      data: assets.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        kind: a.kind,
        ai: a.ai,
        meta: [a.mimeType?.split("/")[1]?.toUpperCase(), a.width && a.height ? `${a.width}×${a.height}` : null]
          .filter(Boolean)
          .join(" · "),
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function generateImageAction(input: {
  accountId: string;
  prompt: string;
  style: TemplateStyleId;
}): Promise<ActionResult<LibraryAsset>> {
  try {
    const { auth, account } = await ownedAccount(input.accountId);
    const asset = await generateImage({
      workspaceId: auth.workspaceId,
      accountId: account.id,
      prompt: input.prompt,
      style: input.style,
    });
    return {
      ok: true,
      data: { id: asset.id, name: asset.name, url: asset.url, kind: "photo", ai: true, meta: "AI · fal.ai" },
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export interface VoicePreview {
  url: string;
  lines: string[];
  estimatedSeconds: number;
}

/** The assembled read, without calling ElevenLabs — drives the script list. */
export async function previewScriptAction(
  postId: string,
  narration: Narration,
): Promise<ActionResult<{ lines: string[]; estimatedSeconds: number }>> {
  try {
    const { post } = await ownedPost(postId);
    const doc = post.doc as unknown as PostDoc;
    const lines = assembleScript(post.style as TemplateStyleId, doc, narration);
    return { ok: true, data: { lines, estimatedSeconds: estimateSeconds(lines) } };
  } catch (err) {
    return fail(err);
  }
}

export async function synthesizeVoiceAction(input: {
  postId: string;
  voiceId: string;
  narration: Narration;
}): Promise<ActionResult<VoicePreview>> {
  try {
    const { auth, post } = await ownedPost(input.postId);
    const doc = post.doc as unknown as PostDoc;
    const lines = assembleScript(post.style as TemplateStyleId, doc, input.narration);

    const track = await synthesizeVoice({
      workspaceId: auth.workspaceId,
      accountId: post.accountId,
      postId: post.id,
      voiceId: input.voiceId,
      lines,
    });

    await prisma.post.update({
      where: { id: post.id },
      data: { voiceId: input.voiceId, narration: input.narration, voiceAssetId: track.assetId },
    });

    return { ok: true, data: { url: track.url, lines, estimatedSeconds: track.estimatedSeconds } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Review gate
// ---------------------------------------------------------------------------

export interface ReviewCheck {
  cleared: boolean;
  issues: string[];
}

/** Required slots and budgets, surfaced as the Review screen's clearance badge. */
export async function checkDraftAction(postId: string): Promise<ActionResult<ReviewCheck>> {
  try {
    const { post } = await ownedPost(postId);
    const doc = post.doc as unknown as PostDoc;
    const issues = validateDoc(post.style as TemplateStyleId, doc);
    return {
      ok: true,
      data: {
        cleared: issues.length === 0,
        issues: issues.map((i) =>
          i.slideIndex < 0
            ? `${i.label} is ${i.problem === "missing" ? "empty" : "too long"}`
            : `Slide ${i.slideIndex + 1}: ${i.label} is ${i.problem === "missing" ? "empty" : "over its limit"}`,
        ),
      },
    };
  } catch (err) {
    return fail(err);
  }
}
