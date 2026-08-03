import { describe, expect, it } from "vitest";
import { toInitialDraft } from "../resolve-draft";
import type { PostDoc } from "@/lib/templates/types";
import { DEFAULT_VOICE_ID } from "@/lib/ai/voices";

const doc: PostDoc = {
  slides: [{ kind: "1a-knockout", f: {} }],
  caption: "hello",
  first: "",
  hashtags: ["#gastriciq"],
  linkSticker: "",
  mention: "",
};

describe("toInitialDraft", () => {
  it("maps a Post row + pillar name into an InitialDraft", () => {
    const result = toInitialDraft(
      {
        id: "post_1",
        accountId: "acct_1",
        style: "carousel",
        archetype: "1a-knockout",
        topic: "Protein tips",
        doc,
        voiceId: "voice_x",
        narration: "condensed",
      },
      "Nutrition",
    );

    expect(result).toEqual({
      postId: "post_1",
      accountId: "acct_1",
      style: "carousel",
      archetype: "1a-knockout",
      topic: "Protein tips",
      pillar: "Nutrition",
      doc,
      voiceId: "voice_x",
      narration: "condensed",
    });
  });

  it("defaults topic to empty string and voiceId to DEFAULT_VOICE_ID when null", () => {
    const result = toInitialDraft(
      {
        id: "post_2",
        accountId: "acct_1",
        style: "story",
        archetype: "2a-quote",
        topic: null,
        doc,
        voiceId: null,
        narration: "verbatim",
      },
      null,
    );

    expect(result.topic).toBe("");
    expect(result.voiceId).toBe(DEFAULT_VOICE_ID);
    expect(result.pillar).toBeNull();
  });
});
