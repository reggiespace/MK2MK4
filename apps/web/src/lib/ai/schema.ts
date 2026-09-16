/**
 * Builds a strict JSON schema from a template manifest, so the model returns
 * exactly the slots the chosen slide sequence declares — nothing more.
 *
 * Character budgets are carried in the prompt rather than as `maxLength`,
 * because strict structured outputs don't enforce string-length keywords.
 * `fitToBudget` re-imposes them on the way back.
 */

import { getManifest } from "@/lib/templates/manifests";
import type { Slot, TemplateStyleId } from "@/lib/templates/types";

/** Slots the model fills — image slots are filled from Assets or fal.ai. */
export function generatableSlots(style: TemplateStyleId, kind: string): Slot[] {
  const k = getManifest(style).kinds[kind];
  if (!k) return [];
  return k.slots.filter((s) => s.type !== "image");
}

function slotSchema(slot: Slot): Record<string, unknown> {
  switch (slot.type) {
    case "pair":
      return {
        type: "array",
        items: {
          type: "object",
          properties: { lead: { type: "string" }, detail: { type: "string" } },
          required: ["lead", "detail"],
          additionalProperties: false,
        },
      };
    case "quiz":
      return {
        type: "array",
        items: {
          type: "object",
          properties: { t: { type: "string" }, correct: { type: "boolean" } },
          required: ["t", "correct"],
          additionalProperties: false,
        },
      };
    case "list":
      return { type: "array", items: { type: "string" } };
    default:
      return { type: "string" };
  }
}

/** Schema for one draft: every slide's slots keyed by position, plus delivery. */
export function draftSchema(style: TemplateStyleId, kinds: string[]): Record<string, unknown> {
  const man = getManifest(style);

  const slideProps: Record<string, unknown> = {};
  kinds.forEach((kind, i) => {
    const slots = generatableSlots(style, kind);
    const props: Record<string, unknown> = {};
    for (const slot of slots) props[slot.id] = slotSchema(slot);
    slideProps[String(i)] = {
      type: "object",
      properties: props,
      // Strict mode requires every declared property to be required.
      required: slots.map((s) => s.id),
      additionalProperties: false,
    };
  });

  const properties: Record<string, unknown> = {
    slides: {
      type: "object",
      properties: slideProps,
      required: kinds.map((_, i) => String(i)),
      additionalProperties: false,
    },
  };
  const required = ["slides"];

  // Stories carry no caption — the link sticker and bio carry the CTA.
  if (!man.noCaption) {
    properties.caption = { type: "string" };
    properties.firstComment = { type: "string" };
    properties.hashtags = { type: "array", items: { type: "string" } };
    required.push("caption", "firstComment", "hashtags");
  }

  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Trim a string to its budget at a word boundary. The model is told the limits
 * but can still overshoot, and a slide that overflows its box is worse than one
 * that ends a word early.
 */
export function fitToBudget(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** A readable per-slot budget list for the prompt. */
export function describeSlots(style: TemplateStyleId, kind: string): string {
  const man = getManifest(style);
  const k = man.kinds[kind];
  if (!k) return "";
  const lines = generatableSlots(style, kind).map((s) => {
    const req = s.required ? "required" : "optional";
    if (s.type === "pair") {
      const lead = s.partMax?.lead ?? 28;
      const detail = s.partMax?.detail ?? 40;
      return `  - ${s.id}: ${s.min ?? 3}–${s.maxItems ?? 4} items, each { lead ≤ ${lead} chars, detail ≤ ${detail} chars } (${req})`;
    }
    if (s.type === "quiz") {
      return `  - ${s.id}: ${s.min ?? 2}–${s.maxItems ?? 4} answers { t ≤ ${s.max || 24} chars, correct: boolean } — exactly one true (${req})`;
    }
    if (s.type === "list") {
      return `  - ${s.id}: ${s.min ?? 2}–${s.maxItems ?? 3} lines, each ≤ ${s.max || 40} chars (${req})`;
    }
    // `max: 0` means unbounded — URLs, timestamps and post refs carry no
    // character budget. Printing "≤ 0 chars" told the model to emit nothing,
    // which then failed the Review gate for being empty and required.
    if (s.max === 0) return `  - ${s.id} (${s.label}): no length limit, ${req}`;
    if (s.id === "imagePrompt") {
      return [
        `  - ${s.id} (${s.label}): ≤ ${s.max} chars, ${req}`,
        `    A fal.ai prompt describing a photograph of this slide's actual subject/topic.`,
        `    Never ask for text, letters, words, numbers, logos, watermarks, or brand names`,
        `    to appear in the image — those are rendered separately by the app. Describe`,
        `    only the photographic scene: subject, setting, lighting, composition.`,
      ].join("\n");
    }
    return `  - ${s.id} (${s.label}): ≤ ${s.max} chars, ${req}`;
  });
  return `${kind} — ${k.name}: ${k.desc}\n${lines.join("\n")}`;
}
