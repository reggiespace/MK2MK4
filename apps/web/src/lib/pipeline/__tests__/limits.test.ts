import { describe, it, expect } from "vitest";
import { captionWithinLimit, IG_CAPTION_MAX } from "@/lib/pipeline/limits";

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
