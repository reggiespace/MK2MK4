import { describeSlots, fitToBudget, generatableSlots } from "./schema";
import { HOOK_LIBRARY, RANKING_SIGNALS, formatPlaybook, leadHookFormula, positionGuidance } from "./playbook";
import { getManifest } from "@/lib/templates/manifests";
import type { SlotValue, TemplateStyleId } from "@/lib/templates/types";
import { isPairItems, isQuizOptions, isStringList } from "@/lib/templates/types";

/**
 * Pure prompt-building side of the AI layer: no import here reaches
 * @/lib/db. generate.ts is the impure side — completeJson there talks to
 * OpenAI and, transitively, the database for credentials — so it keeps
 * `import "server-only"`. This module stays plain so it (and the prompt it
 * builds) can be unit-tested without a database.
 */

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

export interface DraftContext {
  /** How to treat the topic — one sentence from the agent's plan. */
  angle?: string | null;
  /** The agent's research: local events, holidays, seasonality, culture. */
  brief?: string | null;
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

export function systemPrompt(brand: BrandVoice, style: TemplateStyleId): string {
  const man = getManifest(style);
  const parts = [
    `You are the staff social copywriter for ${brand.name} (${brand.handle}).`,
    `Write in ${LANGUAGE[brand.locale] ?? "English"} at a ${READING_LEVEL_LABEL[brand.readingLevel] ?? "grade 7"} reading level.`,
    brand.tones.length ? `Tone: ${brand.tones.join(", ").toLowerCase()}.` : "",
    brand.voiceDescription ? `\nBRAND VOICE\n${brand.voiceDescription}` : "",
    `\nTEMPLATE CONTRACT\n${man.aiContract}`,
    `\n${RANKING_SIGNALS}`,
    `\n${HOOK_LIBRARY}`,
    `\n${formatPlaybook(style)}`,
    `\nCTA CONVENTION (do not break this)
- On-slide copy is engagement-only: save, follow, send. Never put a download link, URL, or "download the app" on a slide or frame.
- The download/external CTA lives only in the post caption (as a soft "→ link in bio") and in the auto-posted first comment (which carries the actual URL).`,
    brand.claimsGuardrail ? `\n${CLAIMS_GUARDRAIL}` : "",
    `\nRULES
- Respect every character budget exactly. Shorter is better than truncated.
- Word counts apply on top of the character budgets and both must hold: a hook headline is 5–8 words, a spoken hook (voiceScript on a hook frame) is 10–14 words, and any on-screen text block in a reel is ≤ 10 words. Where a budget cannot hold the word count, the character budget wins.
- Fill optional slots only when they genuinely add something; otherwise return an empty string and the layout collapses gracefully.
- One idea per slide. Put the strongest point early.
- Write for the save and the send: a line someone keeps, or forwards to a specific person. Asking for a like is never the goal.
- No emoji. No hashtags inside slide copy.`,
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildUserPrompt(
  brand: BrandVoice,
  style: TemplateStyleId,
  kinds: string[],
  topic: string,
  pillar?: string | null,
  ctx: DraftContext = {},
): string {
  const man = getManifest(style);
  // Position guidance is computed from this draft's actual sequence — the user
  // can add, remove and reorder slides, so it cannot be baked into the manifest.
  const guidance = positionGuidance(style, kinds);
  const slideSpecs = kinds
    .map((kind, i) => {
      const notes = guidance[i].map((line) => `  → ${line}`).join("\n");
      const head = `SLIDE ${i} (index "${i}" — slide ${i + 1} of ${kinds.length})`;
      return [head, describeSlots(style, kind), notes].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const lead = leadHookFormula(topic);
  const rotation = `HOOK ROTATION FOR THIS POST
- Lead the opening hook with the "${lead.name}" formula — e.g. "${lead.example}" — unless the topic genuinely fights it, in which case pick another from the library.
- Any second hook surface uses a different formula. Never repeat a formula inside one post.`;

  const delivery = man.noCaption
    ? `This is a Story: it carries no caption. Return slides only.`
    : `POST DELIVERY
- caption: ≤ ${man.postDelivery.caption?.max ?? 2200} chars. Hook-led and keyword-rich, ends with a soft "→ link in bio". Include the download ask here, not on a slide. Open with the hook before the "more" fold and include one explicit save-or-send trigger ("send this to the person who…"); never ask for a like.
- firstComment: ≤ ${man.postDelivery.firstComment?.max ?? 2200} chars. Auto-posted by the scheduler; carries the real link${
        brand.downloadUrl ? ` (${brand.downloadUrl})` : ""
      } plus a short pitch and an engagement question.
- hashtags: 5–10 niche tags, each starting with "#", weighted to tags under 100K posts. No generic mega-tags.`;

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

  return [
    `Create one ${man.label} post.`,
    pillar ? `Content pillar: ${pillar}.` : "",
    `Topic: ${topic}`,
    ctx.angle?.trim() ? `Angle: ${ctx.angle.trim()}` : "",
    brief,
    ``,
    rotation,
    ``,
    `Fill these slides in order. Return an object whose "slides" key maps the index strings to their slot values. The "→" lines are what this slide's position in the sequence demands — they override generic instincts about where content belongs.`,
    ``,
    slideSpecs,
    ``,
    delivery,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/** Re-impose the manifest's budgets and list bounds on the model's output. */
export function enforceBudgets(style: TemplateStyleId, kind: string, fields: Record<string, SlotValue>) {
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
