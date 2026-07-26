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

/**
 * Sends outrank everything, and a send is a private act: someone thinks of one
 * specific person and forwards it. Generic "share this with your friends" asks
 * for nobody in particular and gets nobody in particular, so the trigger has to
 * name a recognisable person and it has to live on the surface — the caption is
 * read after the decision to send has already been made.
 */
export const SEND_TRIGGER = `THE SEND (the strongest signal there is)
- A send happens when a reader pictures one specific person. Name that person on the
  surface: "the friend who's still counting macros", "whoever told you to just eat less".
- Build the send into the layout, not only the caption — a line someone can forward
  as-is, that still makes sense with no context around it.
- "Share this" and "tag a friend" name nobody and earn nothing. Name the person instead.`;

/**
 * Explore and the recommendation surfaces show posts to people who have never
 * heard of this account, and follower count barely enters the ranking. Anything
 * that needs prior context dies there, so every surface is written cold.
 */
export const COLD_VIEWER = `WRITTEN FOR A STRANGER
Most reach now comes from people who do not follow this account and have never seen it
before. Every surface has to land with zero prior context:
- No callbacks to earlier posts, no "as I mentioned", no running jokes, no series numbering.
- Explain or avoid brand vocabulary and product feature names — a stranger will not decode them.
- Name the situation the reader is in, in their words, so someone scrolling recognises
  themselves in one glance. That recognition is what interest-matching keys on.`;

export interface HookFormula {
  id: string;
  name: string;
  example: string;
  /** The three formulas the report finds most consistently viral in 2026. */
  proven: boolean;
}

/**
 * The hook shapes, ten of them. Audiences learn to skip a shape they have seen
 * before, so the report's rule is to rotate 5–10 rather than lean on the best
 * one — the library is deliberately wider than the three that convert hardest.
 */
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
  {
    id: "stat",
    name: "stat shock",
    example: "Half the people on week four quit in the same seven days.",
    proven: false,
  },
  {
    id: "direct",
    name: "direct address",
    example: "If you eat before 9am, this one is for you.",
    proven: false,
  },
  {
    id: "timeline",
    name: "timeline",
    example: "Week 1 versus week 6: the part nobody warns you about.",
    proven: false,
  },
  {
    id: "cost",
    name: "cost of inaction",
    example: "Skipping this one step is what costs you the whole month.",
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

/**
 * The formula this post leads with: seeded, but always one of the proven three.
 *
 * Selected from the proven subset directly rather than by scanning the rotated
 * library for its first proven entry. That scan collapsed as the library grew —
 * with ten formulas, seven of the ten rotations wrap past the tail and land on
 * the same first entry, so most topics opened on the identical shape. Picking
 * within the subset spreads the lead evenly and still keys off the seed.
 */
export function leadHookFormula(seed: string): HookFormula {
  const proven = HOOK_FORMULAS.filter((f) => f.proven);
  if (!proven.length) return HOOK_FORMULAS[0];
  return proven[hashSeed(seed) % proven.length];
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

/** A natural narration pace. Shared with the ElevenLabs read-time estimate. */
export const NARRATION_WPM = 150;

/** Rough English word length including the trailing space. */
const CHARS_PER_WORD = 5.5;

/**
 * Reels up to three minutes reach non-followers, but 30–90 seconds performs
 * consistently better — and the model reads absolute seconds as well as percent
 * viewed, so an over-long script loses on both.
 */
const TARGET_REEL_SECONDS: readonly [number, number] = [30, 90];

export interface ReelScriptBudget {
  minSeconds: number;
  maxSeconds: number;
  minWords: number;
  maxWords: number;
  perFrameWords: number;
  /**
   * True when this frame count cannot reach 30 seconds even with every
   * narration slot full — a short reel is fine, but it has to be loopable
   * rather than padded, so the prompt says so instead of demanding the
   * impossible.
   */
  short: boolean;
}

const wordsForSeconds = (sec: number) => Math.round((sec * NARRATION_WPM) / 60);
const secondsForWords = (words: number) => Math.round((words / NARRATION_WPM) * 60);

/**
 * The whole reel's narration budget, not just one frame's.
 *
 * Per-frame character budgets already exist, but nothing bounded their sum: a
 * six-frame reel could draft three minutes of script one frame at a time. This
 * derives a total from the 30–90s band, clamped to what the frames the user
 * actually chose can hold, so the instruction is always achievable.
 */
export function reelScriptBudget(kinds: string[]): ReelScriptBudget {
  const man = getManifest("reel");
  const capacityChars = kinds.reduce((sum, kind) => {
    const slot = man.kinds[kind]?.slots.find((s) => s.id === NARRATION_SLOT);
    return sum + (slot?.max ?? 0);
  }, 0);
  const capacityWords = Math.floor(capacityChars / CHARS_PER_WORD);

  const maxWords = Math.max(1, Math.min(wordsForSeconds(TARGET_REEL_SECONDS[1]), capacityWords));
  const minWords = Math.min(wordsForSeconds(TARGET_REEL_SECONDS[0]), maxWords);
  const frames = Math.max(1, kinds.length);

  return {
    minSeconds: secondsForWords(minWords),
    maxSeconds: secondsForWords(maxWords),
    minWords,
    maxWords,
    perFrameWords: Math.max(1, Math.round(maxWords / frames)),
    short: capacityWords < wordsForSeconds(TARGET_REEL_SECONDS[0]),
  };
}

/** The total-duration instruction for a reel's user prompt. */
export function reelDurationLines(kinds: string[]): string[] {
  const b = reelScriptBudget(kinds);
  const lines = [
    `TOTAL RUN TIME — the per-frame budgets below are ceilings, not targets. Every voiceScript in this reel is read aloud back to back, and the sum is what the algorithm measures.`,
  ];
  if (b.short) {
    lines.push(
      `This sequence is short by design: about ${b.maxWords} words of narration in total (~${b.maxSeconds}s). Do not pad it to fill the budget — a tight reel watched twice beats a long one watched once, so write it to reward an immediate rewatch.`,
    );
  } else {
    lines.push(
      `Write ${b.minWords}–${b.maxWords} words of narration across all ${kinds.length} frames — roughly ${b.perFrameWords} words per frame — so the finished reel runs ${b.minSeconds}–${b.maxSeconds} seconds at speaking pace. Shorter and fully watched beats longer and abandoned.`,
    );
  }
  return lines;
}

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
    // A cover has to do three jobs in one glance, and naming the audience is the
    // one most often skipped — a stranger scrolling has to see themselves in it.
    `NAME THE AUDIENCE — "${slot.id}", or a supporting slot beside it, says who this is for in the reader's own words: the situation they are in, not the segment they belong to. "If you're three weeks in and stalled", never "for GLP-1 users".`,
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

/** Frames from this index on sit past the point tap-through falls away. */
const STORY_TAPTHROUGH_LIMIT = 5;

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

    // Swipe-through is the carousel's reach multiplier: past ~70% of viewers
    // swiping, the post reaches 3–5× more non-followers. Every slide before the
    // last therefore has to buy the next swipe, the same way a reel frame buys
    // the next second.
    if (style === "carousel" && !isOpening && k.role === "interior") {
      lines.push(
        `EARN THE SWIPE — carry exactly one idea, complete enough to be worth the swipe that got here, and end owing the reader the next slide. Never close the loop mid-deck: a slide that resolves everything is where people stop swiping.`,
      );
    }

    if (style === "reel") {
      if (isOpening) {
        lines.push(
          `WATCH TIME — this frame decides the reel. Viewers commit in under 2 seconds and a drop before 3 seconds throttles distribution, so no intro, no throat-clearing.`,
          `"${NARRATION_SLOT}" is the spoken hook: 10–14 words so it lands inside the first 3 seconds, saying the same thing as the on-screen hook rather than a second version of it.`,
          // Absolute seconds count as well as percent viewed, so a rewatch is
          // worth as much as a longer script and costs the viewer nothing.
          `LOOP — write this opening line so the final line can hand straight back to it. A reel watched twice beats a longer one watched once, and the seam is what makes the second watch feel intentional rather than accidental.`,
        );
      } else if (k.role === "end") {
        lines.push(
          `"${NARRATION_SLOT}" is both narration and on-screen text — keep each on-screen block ≤ 10 words, and land the last line as something worth sending on.`,
          `CLOSE THE LOOP — the final line hands back to the opening hook, so the reel reads as a complete circle and a rewatch starts on the beat rather than on an ending.`,
        );
      } else {
        // Watch time is cumulative: a frame that resolves everything invites the exit.
        lines.push(
          `"${NARRATION_SLOT}" is both narration and on-screen text — keep each on-screen block ≤ 10 words, and end this frame owing the viewer the next one.`,
        );
      }
    }

    if (style === "story") {
      lines.push(...storyStickerLines(k.sticker, isOpening));
      // Tap-through falls away after the fifth frame, so anything past it is a
      // bonus rather than a place to keep the good material.
      if (i >= STORY_TAPTHROUGH_LIMIT) {
        lines.push(
          `PAST FRAME ${STORY_TAPTHROUGH_LIMIT} — tap-through drops off after the fifth frame, so most of this audience never arrives. Nothing essential lives here: it either rewards the people who stayed or it belongs earlier.`,
        );
      }
    }

    if (k.role === "end") {
      lines.push(
        `SAVE TARGET — the last surface is what gets saved and returned to. Make it a checklist, a recap, or one high-value statement that still delivers if it is the only slide someone keeps.`,
        `SEND TARGET — this surface also carries the send. Name the person it should be forwarded to, on the slide itself: "send this to whoever keeps telling you it gets easier". Sends outrank saves, and a send never happens from the caption.`,
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
- Swipe-through is the multiplier: once roughly 70% of viewers swipe the whole way, the post reaches 3–5× more non-followers. Every slide before the last exists to buy the next swipe.
- One idea per slide, and every slide has to be understandable cold, without the one before it.
- 5–8 slides is the working band; the payoff is front-loaded, never saved for the end.`;
    case "reel":
      return `REEL MECHANICS
- Watch time is the #1 factor and it is decided by the first frame; sends per reach is what carries the reel to non-followers.
- Both percent-viewed and absolute seconds count, which is why 30–90 seconds beats three minutes and why a short reel watched twice beats a long one watched once. Write the ending so it hands back to the opening.
- On-screen text IS the narration: each frame's voiceScript is spoken and shown, so every on-screen text block stays ≤ 10 words.
- Originality gates distribution: write for footage this brand shot, never for reposted or recycled-looking video.
- No frame idles. Each one earns the next second of attention.`;
    case "story":
      return `STORY MECHANICS
- Stories are a relationship engine, not a reach engine: optimize for a tap, a vote or a reply. A swipe-away is the failure state.
- Every frame carries exactly one interactive sticker, and the copy exists to make that sticker irresistible.
- A poll works best as the opener (most taps for least effort); a question sticker works best on a later frame, where a reply opens a DM channel.
- Tap-through falls away after the fifth frame, so the sequence front-loads: nothing essential sits past it.`;
    default:
      return `SINGLE-SURFACE MECHANICS
- No swipe, no second frame: one idea, delivered whole, on a surface written to be saved or sent rather than liked.
- With no second surface to carry a follow-up, this one has to be legible to someone who has never seen this account before.
- The headline is the hook and the largest element; everything else supports it.`;
  }
}
