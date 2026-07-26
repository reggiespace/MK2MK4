import { describe, expect, it } from "vitest";
import {
  FEED_PAD,
  MIN_FIT_PX,
  REEL_LAYOUT,
  REEL_TYPE,
  SAFE,
  STORY_LAYOUT,
  STORY_TYPE,
  chromeBase,
  toCanvas,
} from "../safezone";
import { GROUNDS, contrast, inkOn, readableOn } from "../theme";

/**
 * The renderer draws at each format's base size and is scaled to the published
 * canvas, so a legal-looking base px can still land under Instagram's UI once
 * exported. These tests do that conversion and fail if an anchor drifts out of
 * the safe zone — they exist so a future layout tweak can't quietly ship art
 * with its hook behind the caption bar.
 *
 * Requirements come from the algorithm research brief; see safezone.ts.
 */

describe("reel safe zone (1080x1920)", () => {
  const z = SAFE.reel;

  it("scales base px to canvas px at 1080/252", () => {
    expect(z.scale).toBeCloseTo(4.2857, 3);
    expect(toCanvas("reel", 252)).toBeCloseTo(1080, 3);
  });

  it("starts the opening hook inside the 200-600px band", () => {
    // Below 200 it sits under the top chrome; past 600 it may not read before
    // the caption bar paints, which is where reels lose the 3-second gate.
    const hookTop = toCanvas("reel", REEL_LAYOUT.hookTop);
    expect(hookTop).toBeGreaterThanOrEqual(z.hookBand!.from);
    expect(hookTop).toBeLessThanOrEqual(z.hookBand!.to);
  });

  it("keeps copy-bearing chrome below the top overlay", () => {
    // The progress ticks may touch the boundary; anything with words must clear it.
    expect(toCanvas("reel", REEL_LAYOUT.ticksTop)).toBeGreaterThanOrEqual(z.chrome.top);
    expect(toCanvas("reel", REEL_LAYOUT.chipTop)).toBeGreaterThan(z.chrome.top);
  });

  it("clears the action rail on the right", () => {
    // Every right inset must be at least the rail width, narrowest first.
    for (const inset of [
      REEL_LAYOUT.right,
      REEL_LAYOUT.rightHook,
      REEL_LAYOUT.rightTitle,
      REEL_LAYOUT.rightStatement,
    ]) {
      expect(toCanvas("reel", inset)).toBeGreaterThanOrEqual(z.chrome.right);
    }
  });

  it("clears the caption and audio bar at the bottom", () => {
    expect(toCanvas("reel", REEL_LAYOUT.captionBottom)).toBeGreaterThanOrEqual(z.chrome.bottom);
    expect(toCanvas("reel", REEL_LAYOUT.ctaBottom)).toBeGreaterThan(0);
  });

  it("holds every on-screen type size at or above the 45px floor", () => {
    for (const [name, basePx] of Object.entries(REEL_TYPE)) {
      const canvasPx = toCanvas("reel", basePx);
      expect(canvasPx, `REEL_TYPE.${name} is ${canvasPx.toFixed(1)}px on canvas`).toBeGreaterThanOrEqual(
        z.minTypePx,
      );
    }
  });

  it("keeps a fully shrunk dominant token above the floor", () => {
    // `fitToWidth` may shrink `bigWord`/`statValue` all the way to MIN_FIT_PX.
    expect(toCanvas("reel", MIN_FIT_PX)).toBeGreaterThanOrEqual(z.minTypePx);
  });
});

describe("story safe zone (1080x1920)", () => {
  const z = SAFE.story;

  it("keeps every copy-bearing anchor out of the story and reply bars", () => {
    const copyAnchors = [
      "barTop",
      "pollTop",
      "questionTop",
      "quizTop",
      "sliderTop",
      "countdownTop",
      "reshareTop",
    ] as const;

    for (const name of copyAnchors) {
      const top = toCanvas("story", STORY_LAYOUT[name]);
      expect(top, `STORY_LAYOUT.${name} is ${top.toFixed(1)}px on canvas`).toBeGreaterThan(z.chrome.top);
      expect(top).toBeLessThan(z.canvas.h - z.chrome.bottom);
    }
  });

  it("exempts only the decorative segment bar from the top bar rule", () => {
    // It mimics Instagram's own progress chrome and carries no words.
    expect(toCanvas("story", STORY_LAYOUT.segsTop)).toBeLessThan(z.chrome.top);
  });

  it("holds every on-screen type size at or above the 45px floor", () => {
    for (const [name, basePx] of Object.entries(STORY_TYPE)) {
      const canvasPx = toCanvas("story", basePx);
      expect(canvasPx, `STORY_TYPE.${name} is ${canvasPx.toFixed(1)}px on canvas`).toBeGreaterThanOrEqual(
        z.minTypePx,
      );
    }
  });
});

describe("feed safe zone (1080x1350)", () => {
  it("puts the inset inside the 84-92px design band", () => {
    const inset = toCanvas("carousel", FEED_PAD);
    expect(inset).toBeGreaterThanOrEqual(84);
    expect(inset).toBeLessThanOrEqual(92);
  });

  it("shares one geometry across all three 4:5 formats", () => {
    for (const style of ["carousel", "single", "photo"] as const) {
      expect(SAFE[style].canvas).toEqual({ w: 1080, h: 1350 });
      expect(SAFE[style].scale).toBeCloseTo(3.176, 2);
    }
  });

  it("rounds chrome outward so rounding never eats margin", () => {
    const c = chromeBase("carousel");
    expect(toCanvas("carousel", c.top)).toBeGreaterThanOrEqual(SAFE.carousel.chrome.top);
    expect(toCanvas("carousel", c.left)).toBeGreaterThanOrEqual(SAFE.carousel.chrome.left);
  });
});

describe("body-copy contrast", () => {
  // The brief requires 4.5:1 for body text. Large display type is allowed to sit
  // lower, which is what `safeOn`'s 2.2 minimum is for.
  const BODY_MIN = 4.5;

  it("clears 4.5:1 for the primary foreground on every ground", () => {
    for (const [name, g] of Object.entries(GROUNDS)) {
      const ratio = contrast(g.fg, g.base);
      expect(ratio, `${name}: fg ${g.fg} on ${g.base} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        BODY_MIN,
      );
    }
  });

  it("clears 4.5:1 for the subdued foreground on every ground", () => {
    // This is the one that used to fail: translucent paper composited to 3.0-4.4:1.
    for (const [name, g] of Object.entries(GROUNDS)) {
      const ratio = contrast(g.sub, g.base);
      expect(ratio, `${name}: sub ${g.sub} on ${g.base} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        BODY_MIN,
      );
    }
  });

  it("keeps any brand accent legible as words on any ground", () => {
    // The guardrail promise: pick any accent, never hand-tune per slide.
    const accents = ["#5c7556", "#b89251", "#3b5a78", "#ffffff", "#000000", "#f2c744", "#7d5fff"];
    for (const accent of accents) {
      for (const [name, g] of Object.entries(GROUNDS)) {
        const resolved = readableOn(accent, g.base);
        const ratio = contrast(resolved, g.base);
        expect(
          ratio,
          `accent ${accent} on ${name} resolved to ${resolved} at ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(BODY_MIN);
      }
    }
  });

  it("keeps text printed on an accent fill legible", () => {
    // Myth/fact cards, quiz answers and the countdown button print onto the accent.
    const accents = ["#5c7556", "#b89251", "#3b5a78", "#ffffff", "#f2c744", "#4c6247"];
    for (const accent of accents) {
      const ink = inkOn(accent);
      const ratio = contrast(ink, accent);
      expect(ratio, `ink ${ink} on accent ${accent} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        BODY_MIN,
      );
    }
  });
});
