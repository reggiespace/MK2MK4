/**
 * A starting fal.ai prompt for any image slot.
 *
 * Only the Photo manifest declares an `imagePrompt` slot, so the AI writes a
 * prompt for photo posts and nothing else. Every other format has image slots
 * too — a reel's background frame, a carousel's photo card, a story's backdrop —
 * and the picker opened blank on all of them, which in practice meant nobody
 * generated anything and the slots stayed empty.
 *
 * Adding an `imagePrompt` slot to those manifests would put a "fal.ai prompt"
 * textarea into fill forms the design doesn't have one in. So instead: derive
 * the prompt from the copy already on the frame. The model has written the hook
 * or the headline by this point, and an image that echoes it is what the slot
 * wants anyway.
 *
 * The result is a starting point, not a commitment — it lands in an editable
 * field the user can rewrite before generating.
 */

import { getManifest } from "./manifests";
import type { SlideDoc, TemplateStyleId } from "./types";

/** Copy slots worth feeding an image model, best subject first. */
const SUBJECT_SLOTS = [
  "headline",
  "hook",
  "statement",
  "prompt",
  "title",
  "claim",
  "bigWord",
  "kicker",
  "sub",
  "caption",
] as const;

/**
 * Per-format framing. A reel background has to survive text set over it and a
 * 9:16 crop; a feed card is 4:5 and can carry more of the subject. Both stay
 * editorial rather than stock — the design's grounds are muted, and a saturated
 * stock photo fights them.
 */
const FRAMING: Record<TemplateStyleId, string> = {
  // The hook sits in a band roughly a fifth to a third of the way down the
  // frame, so that band specifically has to stay quiet — "upper two-thirds"
  // was vague enough to come back with a subject sitting right under the text.
  reel: "Vertical 9:16 composition with the subject in the lower third and well off-centre, leaving the upper third completely calm and uncluttered so large text can sit over it. Soft depth of field, muted natural light.",
  story: "Vertical 9:16 composition, subject centred but with generous quiet space top and bottom for the story bar and reply bar. Soft, warm, unhurried.",
  carousel: "4:5 editorial still, single clear subject, shallow depth of field, warm muted palette, plenty of negative space for a caption to sit.",
  single: "4:5 editorial still, single clear subject, shallow depth of field, warm muted palette, generous negative space.",
  photo: "4:5 editorial lifestyle photograph, natural light, warm muted palette, one clear subject, shallow depth of field.",
};

const BASE = "Photographic, documentary feel, no text, no logos, no watermarks, no visible brand names.";

/**
 * The subject guardrail the imagery spec called for and that was never shipped.
 *
 * This is a health-adjacent brand, so the imagery carries the same obligations
 * the copy does: a before/after body or a bathroom scale makes a weight-loss
 * claim without a word of copy, and clinical imagery reads as medical advice.
 * It doubles as a distribution rule — body-comparison imagery is exactly what
 * the platform's sensitive-content filters demote.
 */
const GUARDRAIL =
  "No before/after body comparisons, no bathroom scales, no weight or measurement numbers, no clinical or medical-procedure imagery, no injections or syringes, no exposed torsos, no bodies framed as the subject of scrutiny.";

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The subject line: whichever copy slot on this frame reads most like a thing to
 * photograph. Falls back to the topic so a slide filled with nothing but an
 * image slot still gets a usable prompt.
 */
function subject(slide: SlideDoc, topic: string): string {
  for (const id of SUBJECT_SLOTS) {
    const v = txt(slide.f[id]);
    // One-word slots (`bigWord`) are legitimate subjects; skip only empties.
    if (v) return v;
  }
  return topic.trim();
}

export interface PromptContext {
  style: TemplateStyleId;
  slide: SlideDoc | undefined;
  /** The draft's topic, used when the frame carries no copy yet. */
  topic?: string;
  /** Brand name, so the imagery reads as this account's rather than generic. */
  brand?: string;
}

/**
 * Build the picker's starting prompt. An explicit `imagePrompt` on the frame
 * wins on subject and framing — that is the AI's own considered prompt on the
 * Photo format, and nothing here should override it. The guardrail is the one
 * exception: it is additive and applies to every prompt this app sends, so a
 * generated `imagePrompt` cannot opt out of it.
 */
export function suggestImagePrompt({ style, slide, topic = "", brand = "" }: PromptContext): string {
  if (!slide) return "";

  const explicit = txt(slide.f.imagePrompt);
  if (explicit) return explicit.includes(GUARDRAIL) ? explicit : `${explicit} ${GUARDRAIL}`;

  const subj = subject(slide, topic);
  if (!subj) return "";

  const kindDesc = getManifest(style).kinds[slide.kind]?.desc ?? "";
  const parts = [
    `${subj}.`,
    kindDesc ? `Mood: ${kindDesc.toLowerCase()}.` : "",
    FRAMING[style],
    brand ? `In keeping with ${brand}'s calm, evidence-led feed.` : "",
    BASE,
    GUARDRAIL,
  ];

  return parts.filter(Boolean).join(" ");
}
