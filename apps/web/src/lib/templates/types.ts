/**
 * Template manifest types — the slot contract.
 *
 * Source of truth is the design handoff: the five `Template - *.manifest.json`
 * files supply canvas/safeZone/aiContract/maxChars/required, and Studio's inline
 * MANIFEST supplies the UI metadata (kind names, descriptions, grounds, slot
 * types and ordering). Both are merged here so there is exactly one contract the
 * AI fills against and the renderer draws from.
 */

/** Which visual ground a kind is drawn on. Maps to concrete colors in the renderer. */
export type Ground = "dark" | "light" | "primary" | "secondary" | "photo";

/** A kind's position in the sequence. `frame` is Story/Reel's interior equivalent. */
export type SlotRole = "cover" | "interior" | "end" | "frame";

/**
 * Slot input kinds:
 * - `text`  single-line input with a character budget
 * - `area`  multi-line textarea with a character budget
 * - `image` asset-library pick or fal.ai generation
 * - `pair`  repeatable rows of `{ lead, detail }` (checklists)
 * - `list`  repeatable plain strings (recap lines)
 * - `quiz`  repeatable `{ t, correct }` with a single correct answer
 */
export type SlotType = "text" | "area" | "image" | "pair" | "list" | "quiz";

export interface Slot {
  id: string;
  type: SlotType;
  /** Character budget; 0 means unbounded (image slots, URLs, timestamps). */
  max: number;
  required: boolean;
  label: string;
  placeholder?: string;
  /** Repeatable slots only. */
  min?: number;
  maxItems?: number;
  /** `pair` slots only — per-part character budgets. */
  partMax?: { lead: number; detail: number };
}

export interface TemplateKind {
  role: SlotRole;
  ground: Ground;
  name: string;
  desc: string;
  slots: Slot[];
  /** Story only — which interactive sticker this frame carries. */
  sticker?: string;
}

export interface PostDeliveryField {
  max: number;
  required: boolean;
  role: string;
}

export interface TemplateManifest {
  /** Style id: carousel | reel | story | single | photo */
  id: TemplateStyleId;
  label: string;
  aspect: "4:5" | "9:16";
  /** Export canvas in real pixels. */
  canvas: { width: number; height: number };
  /** Preview base dimensions the renderer draws at before scaling. */
  base: { w: number; h: number };
  safeZone: { note: string; insetPx?: number; top?: number; bottom?: number; left?: number; right?: number };
  aiContract: string;
  accentGuardrail: string;
  kinds: Record<string, TemplateKind>;
  /** Kind ids usable as the opening slide/frame. */
  cover: string[];
  /** Kind ids insertable in the middle. */
  interior: string[];
  /** Kind id always pinned last, or null when the format has no end card. */
  end: string | null;
  /** Single-frame formats (single, photo) have no thumbnail strip. */
  single?: boolean;
  /** Reels carry per-frame voice scripts. */
  voice?: boolean;
  /** Stories carry no caption — link sticker + mention instead. */
  noCaption?: boolean;
  postDelivery: Record<string, PostDeliveryField>;
  /** Default slide sequence when a draft is first built. */
  defaultSequence: (arch: string) => string[];
}

export type TemplateStyleId = "carousel" | "reel" | "story" | "single" | "photo";

/** A single slide/frame in a draft: which kind, and the values filled into its slots. */
export interface SlideDoc {
  kind: string;
  f: Record<string, SlotValue>;
}

export type SlotValue =
  | string
  | null
  | ImageValue
  | PairItem[]
  | QuizOption[]
  | string[];

export interface ImageValue {
  id: string;
  name: string;
  url?: string;
  /** CSS gradient used as a stand-in until a real asset URL exists. */
  tint?: string;
  kind?: string;
  ai?: boolean;
}

export interface PairItem {
  lead: string;
  detail: string;
}

export interface QuizOption {
  t: string;
  correct: boolean;
}

/** The full draft the wizard mutates and the renderer reads. */
export interface PostDoc {
  slides: SlideDoc[];
  caption: string;
  first: string;
  hashtags: string[];
  linkSticker: string;
  mention: string;
}

export function isImageValue(v: SlotValue): v is ImageValue {
  return !!v && typeof v === "object" && !Array.isArray(v) && "id" in v;
}

export function isPairItems(v: SlotValue): v is PairItem[] {
  return Array.isArray(v) && (v.length === 0 || (typeof v[0] === "object" && v[0] !== null && "lead" in v[0]));
}

export function isQuizOptions(v: SlotValue): v is QuizOption[] {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null && "correct" in v[0];
}

export function isStringList(v: SlotValue): v is string[] {
  return Array.isArray(v) && (v.length === 0 || typeof v[0] === "string");
}

export function asText(v: SlotValue): string {
  return typeof v === "string" ? v : "";
}
