/**
 * Safe-zone geometry and the on-screen type floor, in one place.
 *
 * `Slide` draws at each manifest's `base` size and is scaled up to the published
 * canvas, so every number in the renderer is a *base* pixel that becomes
 * `base * scale` canvas pixels in the exported PNG. Reasoning about Instagram's
 * UI overlays means converting between the two constantly, which is exactly the
 * kind of arithmetic that rots when it is scattered as literals across a 1200
 * line component.
 *
 * So: the platform requirements live here in CANVAS px, the renderer's anchors
 * live here in BASE px, and `__tests__/safezone.test.ts` asserts the second set
 * lands inside the first. Move an element in `Slide.tsx` by editing an anchor
 * below and the test tells you whether it is still legal.
 *
 * Sources for the canvas-px numbers (research brief):
 *   Reel  9:16 — IG overlays ~bottom 400-480px, ~right 90-120px, ~top 220-240px.
 *                All copy inside a centred ~900x1440 box; the hook must start in
 *                the y=200-600 band; on-screen type >= 45-60px at weight 700+.
 *   Story 9:16 — keep the sticker and all key copy out of the top ~250px (story
 *                bar) and bottom ~250px (reply bar).
 *   Feed  4:5  — key content inside a centred 1000x1270 box; design inset 84-92px.
 */

import type { TemplateStyleId } from "./types";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeZone {
  /** Published PNG size. */
  canvas: { w: number; h: number };
  /** Size `Slide` actually draws at. */
  base: { w: number; h: number };
  /** canvas.w / base.w — the multiplier from a renderer px to a published px. */
  scale: number;
  /** Platform chrome / design inset to clear, canvas px measured from each edge. */
  chrome: Insets;
  /** Minimum on-screen copy size, canvas px. 0 = the surface imposes no floor. */
  minTypePx: number;
  /** Minimum weight for on-screen copy where a floor applies. */
  minTypeWeight: number;
  /** Band, canvas px from the top, the opening hook must start inside. */
  hookBand: { from: number; to: number } | null;
}

function zone(
  canvas: { w: number; h: number },
  base: { w: number; h: number },
  chrome: Insets,
  minTypePx: number,
  minTypeWeight: number,
  hookBand: { from: number; to: number } | null,
): SafeZone {
  return { canvas, base, scale: canvas.w / base.w, chrome, minTypePx, minTypeWeight, hookBand };
}

/**
 * The 4:5 feed formats share one geometry. `chrome` is the 84px *design* inset
 * rather than the 40px hard box, because the design inset is the stricter of the
 * two rules the brief states and clearing it clears both.
 */
const feed = (): SafeZone =>
  zone({ w: 1080, h: 1350 }, { w: 340, h: 425 }, { top: 84, right: 84, bottom: 84, left: 84 }, 0, 0, null);

export const SAFE: Record<TemplateStyleId, SafeZone> = {
  carousel: feed(),
  single: feed(),
  photo: feed(),
  reel: zone(
    { w: 1080, h: 1920 },
    { w: 252, h: 448 },
    { top: 240, right: 120, bottom: 480, left: 90 },
    45,
    700,
    { from: 200, to: 600 },
  ),
  story: zone(
    { w: 1080, h: 1920 },
    { w: 252, h: 448 },
    { top: 250, right: 60, bottom: 250, left: 60 },
    45,
    700,
    null,
  ),
};

/** Base px -> published canvas px. */
export const toCanvas = (style: TemplateStyleId, basePx: number): number => basePx * SAFE[style].scale;

/** Published canvas px -> base px. */
export const toBase = (style: TemplateStyleId, canvasPx: number): number => canvasPx / SAFE[style].scale;

/** `chrome` expressed in base px, rounded outward so rounding never eats margin. */
export function chromeBase(style: TemplateStyleId): Insets {
  const z = SAFE[style];
  const c = (n: number) => Math.ceil(n / z.scale);
  return { top: c(z.chrome.top), right: c(z.chrome.right), bottom: c(z.chrome.bottom), left: c(z.chrome.left) };
}

/**
 * Uniform inset for the 4:5 formats, base px. 27 * (1080/340) = 85.76 canvas px,
 * inside the 84-92 design band; the previous 26 landed at 82.59 and missed it.
 */
export const FEED_PAD = 27;

/**
 * Reel anchors, base px on the 252x448 frame.
 *
 * `hookTop` puts the opening block at 411.4 canvas px — inside the 200-600 hook
 * band and clear of the top overlay. `ticksTop`/`chipTop` sit at 240 / 282.9,
 * i.e. below IG's top chrome rather than under it.
 */
export const REEL_LAYOUT = {
  left: 22,
  /** Narrowest legal right inset: 28 * 4.2857 = 120 canvas px = the action rail. */
  right: 28,
  /** Wider right insets the design uses to rag the text column. */
  rightStatement: 44,
  rightHook: 36,
  rightTitle: 40,
  ticksTop: 56,
  chipTop: 66,
  hookTop: 96,
  titleTop: 190,
  captionBottom: 150,
  ctaTop: 56,
  ctaBottom: 112,
} as const;

/**
 * Story anchors, base px.
 *
 * `segsTop` is a deliberate exception: the segment bar is decoration that mimics
 * Instagram's own progress chrome and carries no copy, so it stays at the very
 * top of the frame. Everything that carries words clears the 250px story bar.
 */
export const STORY_LAYOUT = {
  left: 22,
  right: 22,
  segsTop: 14,
  segsSide: 16,
  barTop: 60,
  pollTop: 150,
  questionTop: 170,
  quizTop: 120,
  sliderTop: 190,
  countdownTop: 120,
  reshareTop: 100,
  /** The reshare card is inset further so its 4:5 preview fits between the bars. */
  reshareSide: 44,
} as const;

/** Story anchors that are decorative chrome, exempt from the copy safe zone. */
export const STORY_DECOR_ANCHORS = ["segsTop", "segsSide"] as const;

/** On-screen type for reel frames, base px. Every entry must clear the 45px floor. */
export const REEL_TYPE = {
  kicker: 11,
  hook: 30,
  title: 26,
  sub: 13,
  preWord: 14,
  bigWord: 56,
  caption: 15,
  brand: 11,
  monogram: 11,
  ctaBrand: 12,
  ctaMeta: 11,
  ctaHook: 26,
  ctaRecap: 13,
  ctaFollow: 11,
  ctaSave: 11,
} as const;

/** On-screen type for story frames, base px. Every entry must clear the 45px floor. */
export const STORY_TYPE = {
  kicker: 11,
  prompt: 28,
  promptSm: 26,
  option: 15,
  optionSm: 14,
  sticker: 13,
  timer: 24,
  meta: 11,
  link: 13,
  flag: 11,
  handle: 11,
  brand: 11,
  monogram: 11,
} as const;

/**
 * Lower bound `fitToWidth` may shrink a dominant single-token slot to, base px.
 * 12 * 4.2857 = 51.4 canvas px, so even a fully shrunk `bigWord` clears the floor.
 */
export const MIN_FIT_PX = 12;
