/**
 * The five frozen template manifests, merged from the design handoff.
 *
 * Character budgets, required flags, aiContract and postDelivery come from the
 * `Template - *.manifest.json` files; kind names, descriptions, grounds, slot
 * types and sequencing come from Studio's inline MANIFEST. Where the two differ
 * on whether an image slot is required, Studio wins — it draws the deliberate
 * distinction between image-led formats (Photo: image required) and formats
 * where the image is an optional background (Reel/Story frames).
 */

import type { Slot, TemplateManifest, TemplateStyleId } from "./types";

/** Terse slot builder mirroring Studio's `S(id, type, max, req, label)`. */
function s(id: string, type: Slot["type"], max: number, req: 0 | 1, label: string, extra?: Partial<Slot>): Slot {
  return { id, type, max, required: !!req, label, ...extra };
}

const CAROUSEL_POST_DELIVERY = {
  caption: {
    max: 2200,
    required: true,
    role: "post caption; keyword-rich for SEO, ends with soft CTA '→ link in bio'; include the download ask here",
  },
  firstComment: {
    max: 2200,
    required: true,
    role: "auto-posted by Postiz; carries the actual download link + pitch (e.g. 'Get Gastric IQ → <url>')",
  },
  hashtags: { max: 10, required: false, role: "5-10 niche tags, weighted under 100K posts" },
};

const ACCENT_GUARDRAIL =
  "Accent legibility is auto-guarded: when the chosen accent collides with a slide's ground color, the template substitutes a legible sibling (contrast >= 2.2). The AI/user may pick any brand accent freely; do not hand-tune per slide.";

export const CAROUSEL: TemplateManifest = {
  id: "carousel",
  label: "carousel",
  aspect: "4:5",
  canvas: { width: 1080, height: 1350 },
  base: { w: 340, h: 425 },
  safeZone: {
    note: "Keep all text and logo inside a centered 1000x1270 box; design inset is 84-92px.",
    insetPx: 84,
  },
  aiContract:
    "Fill only the slots below and the brand tokens. Never move, add, remove, resize, or restyle elements. Empty optional slots collapse gracefully. On-slide copy is engagement-only — the app-download CTA belongs in postDelivery, never on a slide.",
  accentGuardrail: ACCENT_GUARDRAIL,
  kinds: {
    "1a-knockout": {
      role: "cover",
      ground: "dark",
      name: "Knockout",
      desc: "Huge type, dark ground, one-phrase hook",
      slots: [s("kicker", "text", 18, 0, "Kicker"), s("hook", "text", 42, 1, "Hook")],
    },
    "1b-editorial": {
      role: "cover",
      ground: "light",
      name: "Editorial dispatch",
      desc: "Magazine kicker + serif headline",
      slots: [
        s("kicker", "text", 22, 0, "Kicker"),
        s("hook", "text", 60, 1, "Hook"),
        s("lead", "text", 90, 0, "Lead"),
      ],
    },
    "1c-bigstat": {
      role: "cover",
      ground: "primary",
      name: "Big-stat",
      desc: "Dominant number + line",
      slots: [
        s("kicker", "text", 18, 0, "Kicker"),
        s("statValue", "text", 8, 1, "Stat"),
        s("statLine", "text", 64, 1, "What it means"),
        s("source", "text", 48, 0, "Source"),
      ],
    },
    "1d-quote": {
      role: "cover",
      ground: "secondary",
      name: "Quote",
      desc: "Pull quote, in-their-words",
      slots: [
        s("kicker", "text", 18, 0, "Kicker"),
        s("quote", "area", 80, 1, "Quote"),
        s("attribution", "text", 48, 0, "Attribution"),
      ],
    },
    "2a-point": {
      role: "interior",
      ground: "light",
      name: "Point / step",
      desc: "One idea",
      slots: [
        s("index", "text", 3, 0, "No."),
        s("label", "text", 18, 0, "Eyebrow"),
        s("heading", "text", 40, 1, "Heading"),
        s("body", "area", 130, 0, "Body"),
      ],
    },
    "2b-stat": {
      role: "interior",
      ground: "light",
      name: "Stat callout",
      desc: "Figure in a card",
      slots: [
        s("label", "text", 18, 0, "Eyebrow"),
        s("statValue", "text", 8, 1, "Stat"),
        s("statLine", "text", 70, 1, "What it means"),
      ],
    },
    "2c-list": {
      role: "interior",
      ground: "light",
      name: "Checklist",
      desc: "3–4 items",
      slots: [
        s("heading", "text", 44, 1, "Heading"),
        s("items", "pair", 0, 1, "Items", { min: 3, maxItems: 4, partMax: { lead: 28, detail: 40 } }),
      ],
    },
    "2d-image": {
      role: "interior",
      ground: "light",
      name: "Image + caption",
      desc: "Fillable image slot",
      slots: [
        s("image", "image", 0, 1, "Image"),
        s("caption", "text", 40, 1, "Caption"),
        s("captionSub", "text", 56, 0, "Sub-caption"),
      ],
    },
    "2e-myth": {
      role: "interior",
      ground: "light",
      name: "Myth vs fact",
      desc: "Correct a misconception",
      slots: [s("myth", "text", 60, 1, "Myth"), s("fact", "area", 80, 1, "Fact")],
    },
    "2f-cta": {
      role: "end",
      ground: "dark",
      name: "CTA end",
      desc: "Save & follow",
      slots: [
        s("kicker", "text", 16, 0, "Kicker"),
        s("hook", "text", 40, 1, "Hook"),
        s("recap", "list", 40, 1, "Recap", { min: 2, maxItems: 3 }),
        s("followLine", "text", 48, 1, "Follow line"),
      ],
    },
  },
  cover: ["1a-knockout", "1b-editorial", "1c-bigstat", "1d-quote"],
  interior: ["2a-point", "2b-stat", "2c-list", "2d-image", "2e-myth"],
  end: "2f-cta",
  postDelivery: CAROUSEL_POST_DELIVERY,
  defaultSequence: (arch) => [arch, "2a-point", "2e-myth", "2d-image", "2f-cta"],
};

export const REEL: TemplateManifest = {
  id: "reel",
  label: "reel",
  aspect: "9:16",
  canvas: { width: 1080, height: 1920 },
  base: { w: 252, h: 448 },
  voice: true,
  safeZone: {
    note: "Instagram UI overlays the frame. Keep ALL text/logo/CTA inside a centered ~900x1440 box: clear the top ~220px, bottom ~480px (caption + audio bar), and right ~120px (action rail).",
    left: 90,
    right: 90,
    top: 240,
    bottom: 240,
  },
  aiContract:
    "Fill only the slots below and the brand tokens. Never move, add, remove, resize, or restyle elements. On-screen text = the ElevenLabs voice script (voiceScript per frame drives narration AND the visible caption). Backgrounds marked image are fal.ai slots. On-screen copy is engagement-only — the app-download CTA belongs in postDelivery, never on a frame.",
  accentGuardrail: ACCENT_GUARDRAIL,
  kinds: {
    "1a-statement": {
      role: "cover",
      ground: "photo",
      name: "Statement hook",
      desc: "Image + scrim",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("hook", "text", 46, 1, "Hook"),
        s("image", "image", 0, 0, "Background"),
        s("voiceScript", "area", 140, 1, "Voice script"),
      ],
    },
    "1b-question": {
      role: "cover",
      ground: "primary",
      name: "Question hook",
      desc: "Opens a curiosity gap",
      slots: [
        s("hook", "text", 44, 1, "Hook"),
        s("sub", "text", 52, 0, "Tension line"),
        s("voiceScript", "area", 140, 1, "Voice script"),
      ],
    },
    "1c-kinetic": {
      role: "cover",
      ground: "dark",
      name: "Kinetic word",
      desc: "One animated word",
      slots: [
        s("preWord", "text", 24, 0, "Lead-in"),
        s("bigWord", "text", 10, 1, "Big word"),
        s("sub", "text", 46, 0, "Payoff"),
        s("voiceScript", "area", 140, 1, "Voice script"),
      ],
    },
    "1d-title": {
      role: "frame",
      ground: "photo",
      name: "Title card",
      desc: "Topic title over image",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("title", "text", 40, 1, "Title"),
        s("sub", "text", 48, 0, "Sub"),
        s("image", "image", 0, 0, "Background"),
        s("voiceScript", "area", 200, 1, "Voice script"),
      ],
    },
    "1e-caption": {
      role: "frame",
      ground: "photo",
      name: "Voice caption",
      desc: "Lower-third spoken line",
      slots: [
        s("caption", "text", 90, 1, "Caption"),
        s("image", "image", 0, 0, "Background"),
        s("voiceScript", "area", 200, 1, "Voice script"),
      ],
    },
    "1f-cta": {
      role: "end",
      ground: "dark",
      name: "End CTA",
      desc: "Save & follow",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("hook", "text", 40, 1, "Hook"),
        s("recap", "list", 40, 1, "Recap", { min: 2, maxItems: 3 }),
        s("voiceScript", "area", 160, 1, "Voice script"),
      ],
    },
  },
  cover: ["1a-statement", "1b-question", "1c-kinetic"],
  interior: ["1d-title", "1e-caption"],
  end: "1f-cta",
  postDelivery: {
    ...CAROUSEL_POST_DELIVERY,
    caption: {
      max: 2200,
      required: true,
      role: "post caption; hook-led, ends with soft CTA '→ link in bio'; include the download ask here",
    },
    audio: { max: 0, required: false, role: "trending-audio note or 'Original audio'" },
  },
  defaultSequence: (arch) => [arch, "1d-title", "1e-caption", "1f-cta"],
};

export const STORY: TemplateManifest = {
  id: "story",
  label: "story",
  aspect: "9:16",
  canvas: { width: 1080, height: 1920 },
  base: { w: 252, h: 448 },
  noCaption: true,
  safeZone: {
    note: "Keep the interactive sticker and all key copy out of the top ~250px (story bar) and bottom ~250px (reply bar). Center band is the tap zone.",
    top: 250,
    bottom: 250,
    left: 60,
    right: 60,
  },
  aiContract:
    "Stories optimize for interaction (tap/vote/reply), NOT reach. Every frame MUST carry exactly one interactive sticker as its tap target. Fill only the slots + the sticker options; never move/add/remove/restyle elements. Lead with a POLL — it collects the most taps for the least viewer effort. Save the QUESTION sticker for a later frame: its value is opening a DM reply, which is a stronger relationship signal than a tap. The app-download CTA belongs in postDelivery/link, never as body copy.",
  accentGuardrail: ACCENT_GUARDRAIL,
  kinds: {
    "1a-poll": {
      role: "cover",
      ground: "primary",
      name: "Poll",
      desc: "Lowest-effort tap",
      sticker: "poll",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("prompt", "text", 44, 1, "Prompt"),
        s("optionA", "text", 20, 1, "Option A"),
        s("optionB", "text", 20, 1, "Option B"),
        s("image", "image", 0, 0, "Background"),
      ],
    },
    "1b-question": {
      role: "cover",
      ground: "secondary",
      name: "Question",
      desc: "Opens a DM reply",
      sticker: "question",
      slots: [s("prompt", "text", 40, 1, "Prompt"), s("stickerLabel", "text", 40, 1, "Sticker label")],
    },
    "1c-quiz": {
      role: "cover",
      ground: "dark",
      name: "Quiz",
      desc: "True / false",
      sticker: "quiz",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("prompt", "text", 48, 1, "Claim"),
        s("options", "quiz", 24, 1, "Answers", { min: 2, maxItems: 4 }),
      ],
    },
    "1d-slider": {
      role: "cover",
      ground: "primary",
      name: "Emoji slider",
      desc: "Feeling scale",
      sticker: "emoji-slider",
      slots: [s("prompt", "text", 44, 1, "Prompt"), s("emoji", "text", 2, 1, "Emoji")],
    },
    "1e-countdown": {
      role: "frame",
      ground: "dark",
      name: "Countdown + link",
      desc: "Launch + tap link",
      sticker: "countdown+link",
      slots: [
        s("kicker", "text", 20, 0, "Kicker"),
        s("headline", "text", 40, 1, "Headline"),
        s("targetTime", "text", 0, 1, "Target time"),
        s("linkLabel", "text", 24, 1, "Link label"),
        s("linkUrl", "text", 0, 1, "Link URL"),
      ],
    },
    "1f-reshare": {
      role: "frame",
      ground: "secondary",
      name: "Reshare post",
      desc: "Amplify a feed post",
      sticker: "post-reshare",
      slots: [s("flag", "text", 18, 0, "Banner"), s("postRef", "text", 0, 1, "Post ref")],
    },
  },
  cover: ["1a-poll", "1b-question", "1c-quiz", "1d-slider"],
  interior: ["1c-quiz", "1d-slider", "1e-countdown", "1f-reshare"],
  end: null,
  postDelivery: {
    linkSticker: { max: 0, required: false, role: "URL for the tappable link sticker when a frame uses one" },
    mention: { max: 0, required: false, role: "optional @mention/collab tag" },
  },
  defaultSequence: (arch) => [arch, "1c-quiz", "1e-countdown"],
};

export const SINGLE: TemplateManifest = {
  id: "single",
  label: "single",
  aspect: "4:5",
  canvas: { width: 1080, height: 1350 },
  base: { w: 340, h: 425 },
  single: true,
  safeZone: { note: "Design inset 84-92px on all sides; keep text inside it for both ratios.", insetPx: 84 },
  aiContract:
    "One standalone post carrying a single idea — no swipe. Pick ONE layout and ONE ratio. Fill only the slots + brand tokens; never move/add/remove/restyle. Engagement-only on frame — the download CTA belongs in postDelivery.",
  accentGuardrail: ACCENT_GUARDRAIL,
  kinds: {
    "1a-stat": {
      role: "cover",
      ground: "primary",
      name: "Stat",
      desc: "Dominant figure",
      slots: [
        s("kicker", "text", 18, 0, "Kicker"),
        s("statValue", "text", 8, 1, "Stat"),
        s("statLine", "text", 64, 1, "What it means"),
        s("source", "text", 48, 0, "Source"),
      ],
    },
    "1b-quote": {
      role: "cover",
      ground: "secondary",
      name: "Quote",
      desc: "Pull quote",
      slots: [
        s("kicker", "text", 18, 0, "Kicker"),
        s("quote", "area", 84, 1, "Quote"),
        s("attribution", "text", 48, 0, "Attribution"),
      ],
    },
    "1c-myth": {
      role: "cover",
      ground: "light",
      name: "Myth vs fact",
      desc: "One correction",
      slots: [s("myth", "text", 56, 1, "Myth"), s("fact", "text", 64, 1, "Fact")],
    },
    "1d-announce": {
      role: "cover",
      ground: "dark",
      name: "Announcement",
      desc: "Launch flag",
      slots: [
        s("pill", "text", 12, 0, "Pill"),
        s("kicker", "text", 20, 0, "Kicker"),
        s("headline", "text", 48, 1, "Headline"),
        s("sub", "text", 80, 0, "Sub"),
      ],
    },
  },
  cover: ["1a-stat", "1b-quote", "1c-myth", "1d-announce"],
  interior: [],
  end: null,
  postDelivery: CAROUSEL_POST_DELIVERY,
  defaultSequence: (arch) => [arch],
};

export const PHOTO: TemplateManifest = {
  id: "photo",
  label: "photo",
  aspect: "4:5",
  canvas: { width: 1080, height: 1350 },
  base: { w: 340, h: 425 },
  single: true,
  safeZone: {
    note: "Text sits over a built-in scrim; keep copy inside an 84px inset. Scrim is part of the template — never remove it.",
    insetPx: 84,
  },
  aiContract:
    "Image-led post. Pick ONE treatment. The image slot is required and is a drop/upload OR a fal.ai generation. Fill only the image, the labelled copy, and brand tokens; never move/add/remove/restyle, and never remove the scrim. Engagement-only on frame; download CTA lives in postDelivery.",
  accentGuardrail: ACCENT_GUARDRAIL,
  kinds: {
    "1a-lifestyle": {
      role: "cover",
      ground: "photo",
      name: "Lifestyle",
      desc: "Full-bleed image",
      slots: [
        s("image", "image", 0, 1, "Image"),
        s("imagePrompt", "area", 200, 0, "fal.ai prompt"),
        s("kicker", "text", 18, 0, "Kicker"),
        s("headline", "text", 52, 1, "Headline"),
      ],
    },
    "1b-fieldnote": {
      role: "cover",
      ground: "light",
      name: "Field note",
      desc: "Framed photo",
      slots: [
        s("image", "image", 0, 1, "Image"),
        s("imagePrompt", "area", 200, 0, "fal.ai prompt"),
        s("tag", "text", 22, 0, "Tag"),
        s("caption", "text", 40, 1, "Caption"),
        s("captionSub", "text", 90, 0, "Sub-caption"),
      ],
    },
    "1c-split": {
      role: "cover",
      ground: "light",
      name: "Split panel",
      desc: "Image over panel",
      slots: [
        s("image", "image", 0, 1, "Image"),
        s("imagePrompt", "area", 200, 0, "fal.ai prompt"),
        s("kicker", "text", 18, 0, "Kicker"),
        s("headline", "text", 44, 1, "Headline"),
        s("body", "text", 80, 0, "Body"),
      ],
    },
    "1d-photoquote": {
      role: "cover",
      ground: "photo",
      name: "Photo quote",
      desc: "Testimonial over image",
      slots: [
        s("image", "image", 0, 1, "Image"),
        s("imagePrompt", "area", 200, 0, "fal.ai prompt"),
        s("quote", "area", 80, 1, "Quote"),
        s("attribution", "text", 48, 0, "Attribution"),
      ],
    },
  },
  cover: ["1a-lifestyle", "1b-fieldnote", "1c-split", "1d-photoquote"],
  interior: [],
  end: null,
  postDelivery: CAROUSEL_POST_DELIVERY,
  defaultSequence: (arch) => [arch],
};

export const MANIFESTS: Record<TemplateStyleId, TemplateManifest> = {
  carousel: CAROUSEL,
  reel: REEL,
  story: STORY,
  single: SINGLE,
  photo: PHOTO,
};

export function getManifest(style: TemplateStyleId): TemplateManifest {
  return MANIFESTS[style];
}

export function getKind(style: TemplateStyleId, kind: string) {
  return MANIFESTS[style].kinds[kind];
}

/** The five style cards shown in wizard step 2, in design order. */
export const STYLES = [
  { id: "carousel", name: "Carousel", desc: "Multi-slide swipeable post", meta: "3–8 SLIDES · 4:5", icon: "book", ratio: "4 / 5" },
  { id: "reel", name: "Reel", desc: "Short vertical video, voiced", meta: "15–30S · 9:16", icon: "film", ratio: "9 / 16" },
  { id: "story", name: "Story", desc: "Full-screen, interactive, 24h", meta: "1–5 FRAMES · 9:16", icon: "story", ratio: "9 / 16" },
  { id: "single", name: "Single image", desc: "One-frame feed post", meta: "1 IMAGE · 4:5", icon: "image", ratio: "4 / 5" },
  { id: "photo", name: "Photo", desc: "Image-led, washed treatment", meta: "PHOTO · 4:5", icon: "photo", ratio: "4 / 5" },
] as const;

/** Hard slide-count limits per format, from the manifests' notes. */
export const SLIDE_LIMITS: Record<TemplateStyleId, { min: number; max: number }> = {
  // 5–8 is the researched working band: fewer than five leaves no interior
  // slide between the cover and the end card to carry the payoff.
  carousel: { min: 5, max: 8 },
  reel: { min: 3, max: 8 },
  story: { min: 1, max: 5 },
  single: { min: 1, max: 1 },
  photo: { min: 1, max: 1 },
};
