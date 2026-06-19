import { describe, it, expect } from "vitest";
import { storyBriefSchema, draftResponseSchema } from "@/lib/llm/types";

describe("storyBriefSchema", () => {
  it("parses a complete brief", () => {
    const v = storyBriefSchema.parse({
      story: "Explain the GLP-1 cycle calmly.",
      keyMessage: "Hunger returning on day 4-5 is often expected.",
      beats: ["peak", "fade", "reassurance"],
      ctaIntent: "Invite to see their cycle in-app.",
    });
    expect(v.beats.length).toBe(3);
  });
});

describe("draftResponseSchema", () => {
  it("accepts an optional firstComment", () => {
    const v = draftResponseSchema.parse({
      caption: "x", hashtags: [], recommendedFormat: "single",
      formatRationale: "y", slides: [{ role: "cover", headline: "h" }],
      firstComment: "Everything's free 👇\n🌐 gastric-iq.com",
    });
    expect(v.firstComment).toContain("gastric-iq.com");
  });
});
