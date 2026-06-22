import { describe, it, expect } from "vitest";
import { getLlmProvider } from "@/lib/llm/provider";

const brand = {
  name: "Gastric IQ", locale: "en" as const, toneGuide: "calm",
  pillars: [{ name: "Protein & lean mass", description: "protein-first" }],
};

describe("composeStory (mock)", () => {
  it("returns a usable brief and feeds draft", async () => {
    const llm = getLlmProvider(); // mock when no OPENAI_API_KEY in test env
    const story = await llm.composeStory(brand, { pillarName: "Protein & lean mass" });
    expect(story.keyMessage.length).toBeGreaterThan(0);
    const draft = await llm.draft(brand, { title: "t", angle: "a", format: "single", story });
    expect(draft.firstComment).toBeTruthy();
  });
});
