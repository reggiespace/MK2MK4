/**
 * The Algorithm Report playbook — the research the generated copy has to obey,
 * expressed as prompt fragments.
 *
 * Everything here is pure and manifest-driven. The wizard lets the user add,
 * remove and reorder slides, so nothing may assume a slide count or a fixed
 * sequence: positional guidance is derived from the `kinds` array actually being
 * generated and from each kind's declared `role`.
 */

import { getManifest } from "@/lib/templates/manifests";
import type { Slot, TemplateStyleId } from "@/lib/templates/types";

/**
 * Signal order, not magnitude — a send is worth chasing even when it costs
 * likes, which is why like-bait is banned outright rather than deprioritised.
 */
export const RANKING_SIGNALS = `RANKING SIGNALS (strength order — the top of this list is what you are writing for)
1. Sends / DM shares (strongest)  2. Watch time (gates video reach)  3. Saves  4. Comments  5. Likes (weakest)
Every line must earn a save, provoke a send, or hold a watch. Never write like-bait
("double tap if you agree", "like for part 2") — it buys the weakest signal there is.`;

export interface HookFormula {
  id: string;
  name: string;
  example: string;
  /** The three formulas the report finds most consistently viral in 2026. */
  proven: boolean;
}

/** The six proven hook shapes. Audiences learn to skip a shape, so these rotate. */
export const HOOK_FORMULAS: readonly HookFormula[] = [
  {
    id: "contrarian",
    name: "contrarian claim",
    example: "Everything you've been told about protein timing is backwards.",
    proven: true,
  },
  {
    id: "mistake",
    name: "mistake warning",
    example: "The one carousel mistake quietly killing your reach.",
    proven: true,
  },
  {
    id: "list",
    name: "list tease",
    example: "5 shifts that saved me 10 hours a week (#3 surprised me).",
    proven: true,
  },
  {
    id: "question",
    name: "open question",
    example: "Why do some posts hit 200K while yours die at 2K?",
    proven: false,
  },
  {
    id: "callout",
    name: "callout",
    example: "Most people get this wrong about their fade days.",
    proven: false,
  },
  {
    id: "reveal",
    name: "reveal / POV",
    example: "Here's what nobody tells you about week three.",
    proven: false,
  },
];

/** Stable 32-bit hash so the same topic always rotates to the same hook shape. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The library re-ordered for one post. Rotation is seeded by the topic so two
 * different topics don't open with the same shape — the report's "rotate 5–10
 * formulas" rule, applied without needing post history.
 */
export function rotateHookFormulas(seed: string): HookFormula[] {
  const offset = hashSeed(seed) % HOOK_FORMULAS.length;
  return HOOK_FORMULAS.map((_, i) => HOOK_FORMULAS[(i + offset) % HOOK_FORMULAS.length]);
}

/** The formula this post leads with: rotated, but always one of the proven three. */
export function leadHookFormula(seed: string): HookFormula {
  const rotated = rotateHookFormulas(seed);
  return rotated.find((f) => f.proven) ?? HOOK_FORMULAS[0];
}

export const HOOK_LIBRARY = [
  `HOOK FORMULAS — every hook surface (cover, reel hook frame, story opener) uses one of these.`,
  ...HOOK_FORMULAS.map((f) => `- ${f.name}${f.proven ? " *" : ""} — e.g. "${f.example}"`),
  `* the three most consistently viral in 2026.`,
  `A hook opens a curiosity gap the viewer has to close, and specific beats generic every time:`,
  `"5 shifts that saved me 10 hrs/week" over "productivity tips". A post never uses the same`,
  `formula twice, and the hook's promise must be paid off before the post ends — an unpaid hook`,
  `costs the save and the send.`,
].join("\n");

/** Narration, not on-screen headline — reels carry the spoken script in this slot. */
const NARRATION_SLOT = "voiceScript";

/** Below this the slot is a fragment (a big number, one kinetic word), not a sentence. */
const FRAGMENT_MAX = 24;

function largest(slots: Slot[]): Slot | undefined {
  let best: Slot | undefined;
  for (const s of slots) if (!best || s.max > best.max) best = s;
  return best;
}

/**
 * The slot that carries the headline on a surface — the report's "largest
 * element". Approximated by the widest character budget the layout gives a
 * required copy slot, so it follows the manifest rather than a hardcoded id.
 * `max: 0` slots are unbounded plumbing (URLs, timestamps) and never headlines.
 */
export function headlineSlotFor(style: TemplateStyleId, kind: string): Slot | undefined {
  const k = getManifest(style).kinds[kind];
  if (!k) return undefined;
  const candidates = k.slots.filter((s) => s.type !== "image" && s.id !== NARRATION_SLOT && s.max > 0);
  return largest(candidates.filter((s) => s.required)) ?? largest(candidates);
}

function headlineLines(style: TemplateStyleId, kind: string, lead: string): string[] {
  const slot = headlineSlotFor(style, kind);
  if (!slot) return [lead];
  const lines = [
    lead,
    `"${slot.id}" is the headline and the largest thing on the surface: 5–8 words, inside its ${slot.max}-char budget (if the budget cannot hold 5–8 words, the budget wins).`,
  ];
  if (slot.max < FRAGMENT_MAX) {
    lines.push(
      `"${slot.id}" only holds ${slot.max} chars, so it is a fragment, not a sentence — let the supporting slots on this surface finish the hook.`,
    );
  }
  return lines;
}

/**
 * Where the deck's strongest point has to have landed. The report puts it by the
 * third slide because most viewers never reach slide 7; on a short deck it moves
 * up to the last interior slide that exists.
 */
export function payoffIndex(style: TemplateStyleId, kinds: string[]): number {
  if (style !== "carousel") return -1;
  const man = getManifest(style);
  let idx = -1;
  kinds.forEach((kind, i) => {
    if (i <= 2 && man.kinds[kind]?.role === "interior") idx = i;
  });
  return idx;
}

function storyStickerLines(sticker: string | undefined, isOpening: boolean): string[] {
  const lines: string[] = [];
  if (!sticker) return lines;
  if (isOpening && sticker.includes("poll")) {
    lines.push(
      `POLL FIRST — a poll is the cheapest interaction there is, so it earns the most taps for the least effort. Both options must be genuinely tempting; there is no wrong answer to pick.`,
    );
  } else if (isOpening) {
    lines.push(
      `OPENING FRAME — it carries a ${sticker} sticker. An opener converts on effort: one glance, one tap, no reading. (A poll opener would earn more taps still, so keep this prompt to a single line.)`,
    );
  }
  if (sticker.includes("question")) {
    lines.push(
      `QUESTION STICKER — a reply arrives as a DM, the strongest relationship signal a story can earn. Ask something a real person wants to answer about their own situation, not about the brand.`,
    );
  }
  if (!isOpening && !sticker.includes("question")) {
    lines.push(`This frame's only job is its ${sticker} sticker — write the copy so tapping it is the obvious next move.`);
  }
  return lines;
}

/**
 * Per-position directives, parallel to `kinds`. Empty arrays are normal: a slide
 * only gets a note when its position changes what the copy has to do.
 */
export function positionGuidance(style: TemplateStyleId, kinds: string[]): string[][] {
  const man = getManifest(style);
  const notes: string[][] = kinds.map(() => []);
  const payoff = payoffIndex(style, kinds);

  kinds.forEach((kind, i) => {
    const k = man.kinds[kind];
    if (!k) return;
    const lines = notes[i];
    const isOpening = i === 0;

    if (isOpening) {
      lines.push(
        ...headlineLines(
          style,
          kind,
          `HOOK SURFACE — the first and maybe only thing anyone sees. Open a curiosity gap the viewer has to close, using one of the hook formulas.`,
        ),
      );
      if (man.single) {
        lines.push(
          `There is no swipe and no next frame: this one surface delivers the whole idea and has to earn the save by itself.`,
        );
      }
    }

    // Instagram re-serves an unswiped carousel 24–48h later led by its second
    // slide, so slide 2 is a cover in its own right rather than a continuation.
    if (style === "carousel" && i === 1 && k.role !== "end") {
      lines.push(
        ...headlineLines(
          style,
          kind,
          `SECOND COVER — when a viewer doesn't swipe, Instagram commonly re-serves this post 24–48h later led by this slide. It must stand alone with slide 1 unseen: a fresh hook on a different formula, never "and another thing".`,
        ),
      );
    }

    if (i === payoff) {
      lines.push(
        `FRONT-LOAD — the single strongest, most save-worthy point in the deck lands here at the latest. Most viewers never reach slide 7, so nothing valuable may be held back for later.`,
      );
    }

    if (style === "reel") {
      if (isOpening) {
        lines.push(
          `WATCH TIME — this frame decides the reel. Viewers commit in under 2 seconds and a drop before 3 seconds throttles distribution, so no intro, no throat-clearing.`,
          `"${NARRATION_SLOT}" is the spoken hook: 10–14 words so it lands inside the first 3 seconds, saying the same thing as the on-screen hook rather than a second version of it.`,
        );
      } else if (k.role === "end") {
        lines.push(
          `"${NARRATION_SLOT}" is both narration and on-screen text — keep each on-screen block ≤ 10 words, and land the last line as something worth sending on.`,
        );
      } else {
        // Watch time is cumulative: a frame that resolves everything invites the exit.
        lines.push(
          `"${NARRATION_SLOT}" is both narration and on-screen text — keep each on-screen block ≤ 10 words, and end this frame owing the viewer the next one.`,
        );
      }
    }

    if (style === "story") lines.push(...storyStickerLines(k.sticker, isOpening));

    if (k.role === "end") {
      lines.push(
        `SAVE TARGET — the last surface is what gets saved and returned to. Make it a checklist, a recap, or one high-value statement that still delivers if it is the only slide someone keeps.`,
        `Pay off the promise the hook made, then ask for the save or the send. Never ask for a like.`,
      );
    }
  });

  return notes;
}

/** The format's distribution mechanics — what its reach is actually made of. */
export function formatPlaybook(style: TemplateStyleId): string {
  switch (style) {
    case "carousel":
      return `CAROUSEL MECHANICS
- Reach comes from saves and sends, and from re-serves: an unswiped carousel is often shown again 24–48h later led by its second slide.
- One idea per slide, and every slide has to be understandable cold, without the one before it.
- 5–8 slides is the working band; the payoff is front-loaded, never saved for the end.`;
    case "reel":
      return `REEL MECHANICS
- Watch time is the #1 factor and it is decided by the first frame; sends per reach is what carries the reel to non-followers.
- On-screen text IS the narration: each frame's voiceScript is spoken and shown, so every on-screen text block stays ≤ 10 words.
- No frame idles. Each one earns the next second of attention.`;
    case "story":
      return `STORY MECHANICS
- Stories are a relationship engine, not a reach engine: optimize for a tap, a vote or a reply. A swipe-away is the failure state.
- Every frame carries exactly one interactive sticker, and the copy exists to make that sticker irresistible.
- A poll works best as the opener (most taps for least effort); a question sticker works best on a later frame, where a reply opens a DM channel.`;
    default:
      return `SINGLE-SURFACE MECHANICS
- No swipe, no second frame: one idea, delivered whole, on a surface written to be saved or sent rather than liked.
- The headline is the hook and the largest element; everything else supports it.`;
  }
}
