import { describe, it, expect } from "vitest";
import { captionWithinLimit, IG_CAPTION_MAX } from "@/lib/pipeline/limits";
import { composePostText } from "@/lib/publishers/compose";

describe("captionWithinLimit", () => {
  it("passes a short caption", () => {
    expect(captionWithinLimit("short", ["instagram"]).ok).toBe(true);
  });
  it("fails an over-limit instagram caption", () => {
    const long = "x".repeat(IG_CAPTION_MAX + 1);
    const r = captionWithinLimit(long, ["instagram"]);
    expect(r.ok).toBe(false);
    expect(r.overBy).toBe(1);
  });
});

describe("captionWithinLimit gates the composed post text", () => {
  it("blocks a caption that only exceeds the limit once hashtags are appended", () => {
    // Caption alone is exactly at the limit; hashtags + separators push it over.
    const caption = "x".repeat(IG_CAPTION_MAX);
    const hashtags = ["#one", "#two"];
    expect(captionWithinLimit(caption, ["instagram"]).ok).toBe(true);
    const composed = composePostText(caption, hashtags);
    expect(captionWithinLimit(composed, ["instagram"]).ok).toBe(false);
  });
});
