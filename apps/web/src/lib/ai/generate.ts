import "server-only";
import { completeJson } from "./client";
import { describeSlots, draftSchema, fitToBudget, generatableSlots } from "./schema";
import { getManifest } from "@/lib/templates/manifests";
import { coerceFields } from "@/lib/templates/doc";
import type { PostDoc, SlideDoc, SlotValue, TemplateStyleId } from "@/lib/templates/types";
import { isPairItems, isQuizOptions, isStringList } from "@/lib/templates/types";

export interface BrandVoice {
  name: string;
  handle: string;
  locale: "en" | "pt_BR";
  voiceDescription: string;
  tones: string[];
  readingLevel: string;
  claimsGuardrail: boolean;
  downloadUrl?: string | null;
}

const READING_LEVEL_LABEL: Record<string, string> = {
  grade5: "grade 5",
  grade7: "grade 7",
  grade9: "grade 9",
};

const LANGUAGE: Record<string, string> = {
  en: "English",
  pt_BR: "Brazilian Portuguese (pt-BR)",
};

/**
 * The guardrail from the design's Settings screen: screen every draft for
 * unproven health claims and force model-estimate framing.
 */
const CLAIMS_GUARDRAIL = `CLAIMS GUARDRAIL — this brand publishes health-adjacent content:
- Never state or imply the product causes weight loss, prevents side effects or nausea, prevents muscle loss, diagnoses a condition, or replaces medical advice.
- Frame any physiological figure as a model estimate ("model-estimated", "based on published pharmacokinetic parameters", "based on your logged data") — never as measured or diagnostic.
- No shame, blame or willpower framing. No fear-mongering.
- Do not invent statistics. If a stat slot needs a number, use one that the topic itself supplies, or express a plain quantity the brand can stand behind.`;

function systemPrompt(brand: BrandVoice, style: TemplateStyleId): string {
  const man = getManifest(style);
  const parts = [
    `You are the staff social copywriter for ${brand.name} (${brand.handle}).`,
    `Write in ${LANGUAGE[brand.locale] ?? "English"} at a ${READING_LEVEL_LABEL[brand.readingLevel] ?? "grade 7"} reading level.`,
    brand.tones.length ? `Tone: ${brand.tones.join(", ").toLowerCase()}.` : "",
    brand.voiceDescription ? `\nBRAND VOICE\n${brand.voiceDescription}` : "",
    `\nTEMPLATE CONTRACT\n${man.aiContract}`,
    `\nCTA CONVENTION (do not break this)
- On-slide copy is engagement-only: save, follow, send. Never put a download link, URL, or "download the app" on a slide or frame.
- The download/external CTA lives only in the post caption (as a soft "→ link in bio") and in the auto-posted first comment (which carries the actual URL).`,
    brand.claimsGuardrail ? `\n${CLAIMS_GUARDRAIL}` : "",
    `\nRULES
- Respect every character budget exactly. Shorter is better than truncated.
- Fill optional slots only when they genuinely add something; otherwise return an empty string and the layout collapses gracefully.
- One idea per slide. Put the strongest point early.
- No emoji. No hashtags inside slide copy.`,
  ];
  return parts.filter(Boolean).join("\n");
}

function userPrompt(
  brand: BrandVoice,
  style: TemplateStyleId,
  kinds: string[],
  topic: string,
  pillar?: string | null,
): string {
  const man = getManifest(style);
  const slideSpecs = kinds
    .map((kind, i) => `SLIDE ${i} (index "${i}")\n${describeSlots(style, kind)}`)
    .join("\n\n");

  const delivery = man.noCaption
    ? `This is a Story: it carries no caption. Return slides only.`
    : `POST DELIVERY
- caption: ≤ ${man.postDelivery.caption?.max ?? 2200} chars. Hook-led and keyword-rich, ends with a soft "→ link in bio". Include the download ask here, not on a slide.
- firstComment: ≤ ${man.postDelivery.firstComment?.max ?? 2200} chars. Auto-posted by the scheduler; carries the real link${
        brand.downloadUrl ? ` (${brand.downloadUrl})` : ""
      } plus a short pitch and an engagement question.
- hashtags: 5–10 niche tags, each starting with "#", weighted to tags under 100K posts. No generic mega-tags.`;

  return [
    `Create one ${man.label} post.`,
    pillar ? `Content pillar: ${pillar}.` : "",
    `Topic: ${topic}`,
    ``,
    `Fill these slides in order. Return an object whose "slides" key maps the index strings to their slot values.`,
    ``,
    slideSpecs,
    ``,
    delivery,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/** Re-impose the manifest's budgets and list bounds on the model's output. */
function enforceBudgets(style: TemplateStyleId, kind: string, fields: Record<string, SlotValue>) {
  for (const slot of generatableSlots(style, kind)) {
    const v = fields[slot.id];

    if (slot.type === "pair" && isPairItems(v)) {
      const lead = slot.partMax?.lead ?? 28;
      const detail = slot.partMax?.detail ?? 40;
      fields[slot.id] = v
        .slice(0, slot.maxItems ?? 4)
        .map((it) => ({ lead: fitToBudget(it.lead, lead), detail: fitToBudget(it.detail, detail) }));
      continue;
    }
    if (slot.type === "quiz" && isQuizOptions(v)) {
      fields[slot.id] = v
        .slice(0, slot.maxItems ?? 4)
        .map((o) => ({ t: fitToBudget(o.t, slot.max || 24), correct: o.correct }));
      continue;
    }
    if (slot.type === "list" && isStringList(v)) {
      fields[slot.id] = v.slice(0, slot.maxItems ?? 3).map((x) => fitToBudget(x, slot.max || 40));
      continue;
    }
    if (typeof v === "string") fields[slot.id] = fitToBudget(v, slot.max);
  }
}

export interface GenerateDraftInput {
  workspaceId: string;
  brand: BrandVoice;
  style: TemplateStyleId;
  /** Slide kinds in order — the sequence the wizard built. */
  kinds: string[];
  topic: string;
  pillar?: string | null;
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
    userPrompt(brand, style, kinds, topic, pillar),
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
