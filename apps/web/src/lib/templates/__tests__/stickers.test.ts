import { describe, expect, it } from "vitest";
import { STORY } from "../manifests";
import { stickerPlan, stickerPlanText, type StickerType } from "../stickers";
import type { PostDoc } from "../types";

/**
 * The plan is the only place a story's interactive stickers reach a human, and
 * the frames are worthless without them — so these assert every declared
 * sticker is recognised and every one carries its filled values through.
 */

const doc = (slides: PostDoc["slides"]): PostDoc => ({
  slides,
  caption: "",
  hashtags: [],
  first: "",
  linkSticker: "",
  mention: "",
});

describe("stickerPlan", () => {
  it("is empty for every format that has no interactive stickers", () => {
    const d = doc([{ kind: "1a-hook", f: { headline: "x" } }]);
    for (const style of ["carousel", "reel", "single", "photo"]) {
      expect(stickerPlan(style, d)).toEqual([]);
    }
  });

  it("recognises every sticker the story manifest declares", () => {
    // A manifest kind whose sticker slug doesn't parse would silently drop off
    // the checklist, and the operator would never place it.
    for (const [id, kind] of Object.entries(STORY.kinds)) {
      expect(kind.sticker, `${id} declares no sticker`).toBeTruthy();
      const plan = stickerPlan("story", doc([{ kind: id, f: {} }]));
      expect(plan[0].stickers.length, `${id} (${kind.sticker}) parsed to nothing`).toBeGreaterThan(0);
    }
  });

  it("carries a poll's prompt and both options through in order", () => {
    const plan = stickerPlan(
      "story",
      doc([{ kind: "1a-poll", f: { prompt: "Which hits harder?", optionA: "Protein", optionB: "Fibre" } }]),
    );
    expect(plan[0].stickers[0].type).toBe("poll");
    expect(plan[0].stickers[0].values).toEqual(["Which hits harder?", "Protein", "Fibre"]);
  });

  it("marks the correct answer on a quiz", () => {
    const plan = stickerPlan(
      "story",
      doc([
        {
          kind: "1c-quiz",
          f: {
            prompt: "Protein first always slows the dump.",
            options: [
              { t: "True", correct: true },
              { t: "False", correct: false },
            ],
          },
        },
      ]),
    );
    const values = plan[0].stickers[0].values;
    expect(values[0]).toBe("Protein first always slows the dump.");
    expect(values[1]).toContain("True");
    expect(values[1]).toContain("correct");
    expect(values[2]).toBe("False");
  });

  it("prefers the question sticker's own label over the frame prompt", () => {
    const plan = stickerPlan(
      "story",
      doc([{ kind: "1b-question", f: { prompt: "What's your week 3 like?", stickerLabel: "Ask me anything" } }]),
    );
    expect(plan[0].stickers[0].values).toEqual(["Ask me anything"]);
  });

  it("splits the countdown frame into its two tap targets, primary first", () => {
    // 1e-countdown declares `countdown+link`. Naming both is the point — the
    // operator has to place two stickers, and only one of them is the primary.
    const plan = stickerPlan(
      "story",
      doc([
        {
          kind: "1e-countdown",
          f: {
            headline: "Gastric IQ v2",
            targetTime: "2026-08-01T13:00:00Z",
            linkLabel: "Get it",
            linkUrl: "https://gastriciq.app",
          },
        },
      ]),
    );
    const types = plan[0].stickers.map((s) => s.type);
    expect(types).toEqual<StickerType[]>(["countdown", "link"]);
    expect(plan[0].stickers[0].values).toEqual(["Gastric IQ v2", "2026-08-01T13:00:00Z"]);
    expect(plan[0].stickers[1].values).toEqual(["https://gastriciq.app", "Get it"]);
  });

  it("lists a sticker with nothing filled rather than hiding it", () => {
    // An empty poll still has to be placed; dropping it would read as "no
    // sticker needed on this frame", which is the wrong instruction.
    const plan = stickerPlan("story", doc([{ kind: "1a-poll", f: {} }]));
    expect(plan[0].stickers).toHaveLength(1);
    expect(plan[0].stickers[0].values).toEqual([]);
  });

  it("renders the plan as copyable text keyed by frame number", () => {
    const text = stickerPlanText(
      stickerPlan(
        "story",
        doc([
          { kind: "1a-poll", f: { prompt: "A or B?", optionA: "A", optionB: "B" } },
          { kind: "1b-question", f: { stickerLabel: "Ask me" } },
        ]),
      ),
    );
    expect(text).toContain("Frame 1 (Poll) — Poll sticker");
    expect(text).toContain("Frame 2 (Question) — Question sticker");
    expect(text).toContain("A or B?");
  });
});
