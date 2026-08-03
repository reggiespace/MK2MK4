import "server-only";
import { completeJson } from "./client";
import { draftSchema, fitToBudget } from "./schema";
import { getManifest } from "@/lib/templates/manifests";
import { coerceFields } from "@/lib/templates/doc";
import type { PostDoc, SlideDoc, TemplateStyleId } from "@/lib/templates/types";
import { buildUserPrompt, enforceBudgets, systemPrompt, type BrandVoice } from "./prompt";

// The prompt builders (systemPrompt, buildUserPrompt, enforceBudgets, BrandVoice)
// live in ./prompt, which is pure — no import there reaches @/lib/db, so they're
// unit-testable without a database. This file keeps `import "server-only"` and
// stays impure: completeJson below talks to OpenAI and, transitively through
// @/lib/integrations, to the database for the workspace's credentials. Re-export
// BrandVoice and buildUserPrompt here so existing and future
// `import { BrandVoice } from "@/lib/ai/generate"` call sites keep working.
export { buildUserPrompt, type BrandVoice };

export interface GenerateDraftInput {
  workspaceId: string;
  brand: BrandVoice;
  style: TemplateStyleId;
  /** Slide kinds in order — the sequence the wizard built. */
  kinds: string[];
  topic: string;
  pillar?: string | null;
  /** How to treat the topic. */
  angle?: string | null;
  /** The agent's cultural research. */
  brief?: string | null;
  /** Preserve image slots already filled (e.g. on regenerate). */
  existing?: SlideDoc[];
}

/**
 * Draft one post: per-slot copy honouring every budget, plus caption, first
 * comment and hashtags. Image slots are left untouched for the fill step.
 */
export async function generateDraft(input: GenerateDraftInput): Promise<PostDoc> {
  const { workspaceId, brand, style, kinds, topic, pillar } = input;
  const man = getManifest(style);

  const raw = (await completeJson(
    workspaceId,
    "post_draft",
    draftSchema(style, kinds),
    systemPrompt(brand, style),
    buildUserPrompt(brand, style, kinds, topic, pillar, { angle: input.angle, brief: input.brief }),
  )) as {
    slides?: Record<string, unknown>;
    caption?: string;
    firstComment?: string;
    hashtags?: string[];
  };

  const slides: SlideDoc[] = kinds.map((kind, i) => {
    const generated = (raw.slides?.[String(i)] ?? {}) as Record<string, unknown>;

    // Carry forward any image the user already picked for this slide.
    const previous = input.existing?.[i];
    const merged: Record<string, unknown> = { ...generated };
    if (previous && previous.kind === kind) {
      for (const slot of man.kinds[kind]?.slots ?? []) {
        if (slot.type === "image" && previous.f[slot.id]) merged[slot.id] = previous.f[slot.id];
      }
    }

    const fields = coerceFields(style, kind, merged);
    enforceBudgets(style, kind, fields);
    return { kind, f: fields };
  });

  const hashtags = (raw.hashtags ?? [])
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((t) => t.length > 1)
    .slice(0, man.postDelivery.hashtags?.max ?? 10);

  return {
    slides,
    caption: fitToBudget(raw.caption ?? "", man.postDelivery.caption?.max ?? 2200),
    first: fitToBudget(raw.firstComment ?? "", man.postDelivery.firstComment?.max ?? 2200),
    hashtags,
    linkSticker: brand.downloadUrl ?? "",
    mention: brand.handle,
  };
}
