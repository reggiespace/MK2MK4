/**
 * The Story sticker plan.
 *
 * Instagram's publishing API cannot place an interactive sticker. A poll, a
 * question box, a quiz, an emoji slider, a countdown, a link — all of them are
 * added by hand in the app when the story goes up. So Studio renders a picture
 * of the sticker into the frame (that's what the design's story templates draw)
 * and publishes a flat image, and the real tappable sticker has to be placed on
 * top by whoever posts it.
 *
 * Which means the manifest's `sticker` field was the most load-bearing piece of
 * data nobody was shown. Without it the whole format is premised on interaction
 * it never actually collects: a rendered poll is a JPEG of a poll, and it counts
 * zero taps.
 *
 * This turns the manifest declaration plus the frame's filled slots into a
 * per-frame placement instruction, so Review and the piece detail can hand the
 * operator exactly what to place and what to type into it.
 */

import { getManifest } from "./manifests";
import type { PostDoc, QuizOption, SlideDoc } from "./types";
import { isQuizOptions } from "./types";

export type StickerType = "poll" | "question" | "quiz" | "emoji-slider" | "countdown" | "link" | "post-reshare";

export interface StickerSpec {
  type: StickerType;
  label: string;
  /** What to type into the sticker, in the order Instagram's editor asks for it. */
  values: string[];
  /** Why this sticker, in one line — the research reason, not a restatement. */
  why: string;
}

export interface FramePlan {
  /** 1-based frame number, matching the thumbnail strip. */
  frame: number;
  kindName: string;
  stickers: StickerSpec[];
}

const WHY: Record<StickerType, string> = {
  poll: "Most taps for the least viewer effort — the cheapest interaction on the surface.",
  question: "A typed reply lands in DMs, which is a stronger relationship signal than a tap.",
  quiz: "A right/wrong reveal earns a second look at the frame.",
  "emoji-slider": "No reading required, so it converts on frames people are already scrolling past.",
  countdown: "Opting in schedules a reminder, which brings the viewer back on launch day.",
  link: "The only tappable route off-platform in a story.",
  "post-reshare": "Carries story traffic into a feed post, where it counts as a send.",
};

const LABEL: Record<StickerType, string> = {
  poll: "Poll",
  question: "Question",
  quiz: "Quiz",
  "emoji-slider": "Emoji slider",
  countdown: "Countdown",
  link: "Link",
  "post-reshare": "Post reshare",
};

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Split a manifest declaration into its parts. `1e-countdown` declares
 * `countdown+link` — two tap targets on one frame, against the contract's "one
 * sticker per frame". It stays as the design drew it, because both serve the
 * same launch and the countdown is clearly the primary target; naming them
 * separately is what lets the plan say so instead of hiding it in a slug.
 */
function parse(declared: string): StickerType[] {
  return declared
    .split("+")
    .map((s) => s.trim())
    .filter((s): s is StickerType => s in LABEL);
}

/** What the operator types into each sticker, pulled from the frame's own slots. */
function valuesFor(type: StickerType, slide: SlideDoc): string[] {
  const f = slide.f;
  switch (type) {
    case "poll":
      return [txt(f.prompt), txt(f.optionA), txt(f.optionB)].filter(Boolean);
    case "question":
      return [txt(f.stickerLabel) || txt(f.prompt)].filter(Boolean);
    case "quiz": {
      const options = isQuizOptions(f.options as never) ? (f.options as QuizOption[]) : [];
      return [
        txt(f.prompt),
        ...options.map((o) => `${o.t}${o.correct ? "  ← correct" : ""}`),
      ].filter(Boolean);
    }
    case "emoji-slider":
      return [txt(f.prompt), txt(f.emoji)].filter(Boolean);
    case "countdown":
      return [txt(f.headline), txt(f.targetTime)].filter(Boolean);
    case "link":
      return [txt(f.linkUrl), txt(f.linkLabel)].filter(Boolean);
    case "post-reshare":
      return [txt(f.postRef)].filter(Boolean);
  }
}

/**
 * The placement plan for a story draft. Returns an empty array for any other
 * format — only stories carry interactive stickers.
 */
export function stickerPlan(style: string, doc: PostDoc): FramePlan[] {
  if (style !== "story") return [];
  const man = getManifest("story");

  return doc.slides.map((slide, i) => {
    const kind = man.kinds[slide.kind];
    const types = kind?.sticker ? parse(kind.sticker) : [];
    return {
      frame: i + 1,
      kindName: kind?.name ?? slide.kind,
      stickers: types.map((type) => ({
        type,
        label: LABEL[type],
        values: valuesFor(type, slide),
        why: WHY[type],
      })),
    };
  });
}

/**
 * The plan as plain text, for pasting into a scheduling note or a reminder.
 * Kept next to the structured form so the two can't drift.
 */
export function stickerPlanText(plan: FramePlan[]): string {
  if (!plan.length) return "";
  const lines = ["Place these stickers by hand when the story goes up:"];
  for (const f of plan) {
    if (!f.stickers.length) continue;
    for (const s of f.stickers) {
      lines.push(`Frame ${f.frame} (${f.kindName}) — ${s.label} sticker`);
      for (const v of s.values) lines.push(`    ${v}`);
    }
  }
  return lines.join("\n");
}
