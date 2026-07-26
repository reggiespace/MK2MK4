import { describe, it, expect } from "vitest";

import {
  HOOK_FORMULAS,
  headlineSlotFor,
  leadHookFormula,
  payoffIndex,
  positionGuidance,
  rotateHookFormulas,
} from "@/lib/ai/playbook";

const joined = (lines: string[]) => lines.join("\n");

describe("positionGuidance — carousel", () => {
  const kinds = ["1a-knockout", "2a-point", "2e-myth", "2d-image", "2f-cta"];

  it("returns one note list per slide", () => {
    expect(positionGuidance("carousel", kinds)).toHaveLength(kinds.length);
  });

  it("tells the opening slide it is the hook surface and names its headline slot", () => {
    const [first] = positionGuidance("carousel", kinds);
    expect(joined(first)).toContain("HOOK SURFACE");
    expect(joined(first)).toContain('"hook"');
    expect(joined(first)).toContain("5–8 words");
  });

  it("tells the slide at index 1 it is a second cover, citing the re-serve", () => {
    const notes = positionGuidance("carousel", kinds);
    expect(joined(notes[1])).toContain("SECOND COVER");
    expect(joined(notes[1])).toContain("24–48h");
    expect(joined(notes[0])).not.toContain("SECOND COVER");
  });

  it("front-loads the payoff on the third slide", () => {
    const notes = positionGuidance("carousel", kinds);
    expect(joined(notes[2])).toContain("FRONT-LOAD");
    expect(joined(notes[3])).not.toContain("FRONT-LOAD");
  });

  it("moves the payoff earlier when the deck is shorter", () => {
    expect(payoffIndex("carousel", ["1a-knockout", "2a-point", "2f-cta"])).toBe(1);
    expect(payoffIndex("carousel", ["1a-knockout", "2f-cta"])).toBe(-1);
  });

  it("tells the end slide to be save-worthy, wherever it sits", () => {
    const notes = positionGuidance("carousel", kinds);
    expect(joined(notes[4])).toContain("SAVE TARGET");
    expect(joined(notes[4])).toContain("only slide someone keeps");

    // Role-driven, not index-driven: the same kind moved to the front keeps it.
    const reordered = positionGuidance("carousel", ["2f-cta", "1a-knockout", "2a-point"]);
    expect(joined(reordered[0])).toContain("SAVE TARGET");
    expect(joined(reordered[2])).not.toContain("SAVE TARGET");
  });

  it("does not ask an end card at index 1 to double as a second cover", () => {
    const notes = positionGuidance("carousel", ["1a-knockout", "2f-cta"]);
    expect(joined(notes[1])).not.toContain("SECOND COVER");
    expect(joined(notes[1])).toContain("SAVE TARGET");
  });

  it("never applies the re-serve rule to other formats", () => {
    const notes = positionGuidance("reel", ["1a-statement", "1d-title", "1f-cta"]);
    expect(joined(notes.flat())).not.toContain("SECOND COVER");
  });
});

describe("positionGuidance — reel", () => {
  const notes = positionGuidance("reel", ["1a-statement", "1d-title", "1e-caption", "1f-cta"]);

  it("puts the watch-time rule and the spoken-hook word count on the first frame", () => {
    expect(joined(notes[0])).toContain("WATCH TIME");
    expect(joined(notes[0])).toContain("3 seconds");
    expect(joined(notes[0])).toContain("10–14 words");
    expect(joined(notes[0])).toContain('"voiceScript"');
  });

  it("caps on-screen blocks at 10 words on later frames", () => {
    expect(joined(notes[1])).toContain("≤ 10 words");
    expect(joined(notes[2])).toContain("≤ 10 words");
    expect(joined(notes[0])).not.toContain("≤ 10 words");
  });

  it("closes the loop and asks for the send on the end frame", () => {
    expect(joined(notes[3])).toContain("SAVE TARGET");
  });
});

describe("positionGuidance — story", () => {
  it("rewards a poll opener and moves the DM ask to a later frame", () => {
    const notes = positionGuidance("story", ["1a-poll", "1c-quiz", "1b-question"]);
    expect(joined(notes[0])).toContain("POLL FIRST");
    expect(joined(notes[2])).toContain("QUESTION STICKER");
    expect(joined(notes[2])).toContain("DM");
    expect(joined(notes[0])).not.toContain("QUESTION STICKER");
  });

  it("still names the sticker when the user opens with something other than a poll", () => {
    const notes = positionGuidance("story", ["1b-question", "1e-countdown"]);
    expect(joined(notes[0])).toContain("OPENING FRAME");
    expect(joined(notes[0])).toContain("question");
    expect(joined(notes[1])).toContain("countdown+link");
  });
});

describe("positionGuidance — single-surface formats", () => {
  it("tells a single post it has no second chance", () => {
    const notes = positionGuidance("single", ["1a-stat"]);
    expect(joined(notes[0])).toContain("HOOK SURFACE");
    expect(joined(notes[0])).toContain("no swipe");
  });

  it("survives an unknown kind without throwing", () => {
    expect(positionGuidance("carousel", ["1a-knockout", "nope"])).toEqual([expect.any(Array), []]);
  });
});

describe("headlineSlotFor", () => {
  it("picks the widest required copy slot, not the first one", () => {
    // The stat cover's headline is the meaning line, not the 8-char figure.
    expect(headlineSlotFor("carousel", "1c-bigstat")?.id).toBe("statLine");
    expect(headlineSlotFor("carousel", "1b-editorial")?.id).toBe("hook");
  });

  it("ignores narration, images and unbounded plumbing slots", () => {
    // voiceScript (140) is wider than hook (46) but is spoken, not on screen.
    expect(headlineSlotFor("reel", "1a-statement")?.id).toBe("hook");
    // targetTime and linkUrl carry max 0 (unbounded), so they are not headlines.
    expect(headlineSlotFor("story", "1e-countdown")?.id).toBe("headline");
  });

  it("returns undefined for a kind that does not exist", () => {
    expect(headlineSlotFor("carousel", "nope")).toBeUndefined();
  });

  it("warns when the headline slot is too small to hold 5–8 words", () => {
    const notes = positionGuidance("reel", ["1c-kinetic"]);
    expect(headlineSlotFor("reel", "1c-kinetic")?.max).toBeLessThan(24);
    expect(joined(notes[0])).toContain("fragment, not a sentence");
  });
});

describe("hook formula rotation", () => {
  it("is deterministic per seed and keeps every formula in the library", () => {
    const a = rotateHookFormulas("protein timing");
    expect(rotateHookFormulas("protein timing").map((f) => f.id)).toEqual(a.map((f) => f.id));
    expect([...a].map((f) => f.id).sort()).toEqual(HOOK_FORMULAS.map((f) => f.id).sort());
  });

  it("varies the opening shape across topics", () => {
    const leads = new Set(
      ["food noise", "week three plateau", "protein timing", "fade days", "hydration"].map(
        (t) => leadHookFormula(t).id,
      ),
    );
    expect(leads.size).toBeGreaterThan(1);
  });

  it("always leads with one of the three proven formulas", () => {
    for (const topic of ["a", "hydration", "why sends beat likes", "", "week 3"]) {
      expect(leadHookFormula(topic).proven).toBe(true);
    }
  });
});
