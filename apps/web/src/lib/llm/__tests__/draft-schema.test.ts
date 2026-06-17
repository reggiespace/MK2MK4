import { describe, it, expect } from "vitest";
import { draftSlideSchema } from "@/lib/llm/types";

describe("draftSlideSchema", () => {
  it("accepts an imagePrompt", () => {
    const parsed = draftSlideSchema.parse({
      role: "cover",
      headline: "Hi",
      imagePrompt: "a bowl of oats on a wooden table",
    });
    expect(parsed.imagePrompt).toBe("a bowl of oats on a wooden table");
  });

  it("treats imagePrompt as optional", () => {
    const parsed = draftSlideSchema.parse({ role: "body" });
    expect(parsed.imagePrompt ?? null).toBeNull();
  });
});
