/**
 * Draft-document helpers: building, mutating and validating the `PostDoc` the
 * wizard edits. The AI fills these slots; this module only guarantees a doc is
 * always structurally valid for the renderer and the editor.
 */

import { getManifest, SLIDE_LIMITS } from "./manifests";
import type {
  PostDoc,
  SlideDoc,
  Slot,
  SlotValue,
  TemplateStyleId,
} from "./types";
import { isImageValue, isPairItems, isQuizOptions, isStringList } from "./types";

/** A structurally valid but unfilled value for a slot. */
function emptyValue(slot: Slot): SlotValue {
  switch (slot.type) {
    case "image":
      return null;
    case "pair":
      return Array.from({ length: slot.min ?? 3 }, () => ({ lead: "", detail: "" }));
    case "quiz":
      return Array.from({ length: slot.min ?? 2 }, (_, i) => ({ t: "", correct: i === 0 }));
    case "list":
      return Array.from({ length: slot.min ?? 2 }, () => "");
    default:
      return "";
  }
}

export function emptyFields(style: TemplateStyleId, kind: string): Record<string, SlotValue> {
  const k = getManifest(style).kinds[kind];
  if (!k) return {};
  const out: Record<string, SlotValue> = {};
  for (const slot of k.slots) out[slot.id] = emptyValue(slot);
  return out;
}

export function emptySlide(style: TemplateStyleId, kind: string): SlideDoc {
  return { kind, f: emptyFields(style, kind) };
}

/** A blank draft in the manifest's default sequence for the chosen archetype. */
export function buildEmptyDoc(style: TemplateStyleId, arch: string): PostDoc {
  const man = getManifest(style);
  return {
    slides: man.defaultSequence(arch).map((kind) => emptySlide(style, kind)),
    caption: "",
    first: "",
    hashtags: [],
    linkSticker: "",
    mention: "",
  };
}

/**
 * Coerce an AI-generated (or persisted) field map onto the kind's slot shapes,
 * dropping unknown keys and repairing wrong-typed values. The model can drift;
 * the renderer must never see a malformed doc.
 */
export function coerceFields(
  style: TemplateStyleId,
  kind: string,
  raw: unknown,
): Record<string, SlotValue> {
  const k = getManifest(style).kinds[kind];
  if (!k) return {};
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, SlotValue> = {};

  for (const slot of k.slots) {
    const v = src[slot.id];
    switch (slot.type) {
      case "image":
        out[slot.id] = isImageValue(v as SlotValue) ? (v as SlotValue) : null;
        break;
      case "pair": {
        const arr = Array.isArray(v) ? v : [];
        const items = arr
          .map((it) => ({
            lead: typeof (it as { lead?: unknown })?.lead === "string" ? String((it as { lead: string }).lead) : "",
            detail:
              typeof (it as { detail?: unknown })?.detail === "string" ? String((it as { detail: string }).detail) : "",
          }))
          .slice(0, slot.maxItems ?? 4);
        while (items.length < (slot.min ?? 0)) items.push({ lead: "", detail: "" });
        out[slot.id] = items;
        break;
      }
      case "quiz": {
        const arr = Array.isArray(v) ? v : [];
        const items = arr
          .map((it) => ({
            t: typeof (it as { t?: unknown })?.t === "string" ? String((it as { t: string }).t) : "",
            correct: Boolean((it as { correct?: unknown })?.correct),
          }))
          .slice(0, slot.maxItems ?? 4);
        while (items.length < (slot.min ?? 2)) items.push({ t: "", correct: false });
        // Exactly one correct answer.
        if (!items.some((i) => i.correct) && items.length) items[0].correct = true;
        let seen = false;
        for (const i of items) {
          if (i.correct && seen) i.correct = false;
          if (i.correct) seen = true;
        }
        out[slot.id] = items;
        break;
      }
      case "list": {
        const arr = Array.isArray(v) ? v : [];
        const items = arr.map((x) => (typeof x === "string" ? x : "")).slice(0, slot.maxItems ?? 3);
        while (items.length < (slot.min ?? 0)) items.push("");
        out[slot.id] = items;
        break;
      }
      default:
        out[slot.id] = typeof v === "string" ? v : "";
    }
  }
  return out;
}

/** Where a new slide may be inserted: before the pinned end card, if any. */
export function insertIndexFor(style: TemplateStyleId, slides: SlideDoc[]): number {
  const man = getManifest(style);
  if (man.end && slides.length && slides[slides.length - 1].kind === man.end) {
    return slides.length - 1;
  }
  return slides.length;
}

export function canAddSlide(style: TemplateStyleId, slides: SlideDoc[]): boolean {
  const man = getManifest(style);
  if (man.single || !man.interior.length) return false;
  return slides.length < SLIDE_LIMITS[style].max;
}

export function canDeleteSlide(style: TemplateStyleId, slides: SlideDoc[], index: number): boolean {
  const man = getManifest(style);
  if (index === 0) return false; // the cover is never deleted, only swapped
  if (man.end && slides[index]?.kind === man.end) return false; // end card is pinned
  return slides.length > SLIDE_LIMITS[style].min;
}

/** True when a slide may be reordered (covers and pinned end cards may not). */
export function canMoveSlide(style: TemplateStyleId, slides: SlideDoc[], index: number): boolean {
  return canDeleteSlide(style, slides, index);
}

export interface SlotIssue {
  slideIndex: number;
  kind: string;
  slotId: string;
  label: string;
  problem: "missing" | "over-budget";
}

/** Required-slot and character-budget problems, for the Review gate. */
export function validateDoc(style: TemplateStyleId, doc: PostDoc): SlotIssue[] {
  const man = getManifest(style);
  const issues: SlotIssue[] = [];

  doc.slides.forEach((slide, slideIndex) => {
    const k = man.kinds[slide.kind];
    if (!k) return;
    for (const slot of k.slots) {
      const v = slide.f[slot.id];
      const base = { slideIndex, kind: slide.kind, slotId: slot.id, label: slot.label };

      if (slot.type === "image") {
        if (slot.required && !isImageValue(v)) issues.push({ ...base, problem: "missing" });
        continue;
      }
      if (slot.type === "pair" && isPairItems(v)) {
        if (slot.required && !v.some((i) => i.lead.trim())) issues.push({ ...base, problem: "missing" });
        if (slot.partMax && v.some((i) => i.lead.length > slot.partMax!.lead || i.detail.length > slot.partMax!.detail)) {
          issues.push({ ...base, problem: "over-budget" });
        }
        continue;
      }
      if (slot.type === "quiz" && isQuizOptions(v)) {
        if (slot.required && !v.some((o) => o.t.trim())) issues.push({ ...base, problem: "missing" });
        if (slot.max && v.some((o) => o.t.length > slot.max)) issues.push({ ...base, problem: "over-budget" });
        continue;
      }
      if (slot.type === "list" && isStringList(v)) {
        if (slot.required && !v.some((x) => x.trim())) issues.push({ ...base, problem: "missing" });
        if (slot.max && v.some((x) => x.length > slot.max)) issues.push({ ...base, problem: "over-budget" });
        continue;
      }
      const text = typeof v === "string" ? v : "";
      if (slot.required && !text.trim()) issues.push({ ...base, problem: "missing" });
      if (slot.max > 0 && text.length > slot.max) issues.push({ ...base, problem: "over-budget" });
    }
  });

  // Post-level delivery fields.
  if (!man.noCaption) {
    if (!doc.caption.trim()) {
      issues.push({ slideIndex: -1, kind: "post", slotId: "caption", label: "Caption", problem: "missing" });
    }
    if (!doc.first.trim()) {
      issues.push({ slideIndex: -1, kind: "post", slotId: "firstComment", label: "First comment", problem: "missing" });
    }
  }
  return issues;
}
