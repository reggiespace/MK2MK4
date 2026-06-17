import { describe, it, expect } from "vitest";
import { buildImagePrompt, GUARDRAIL_SUFFIX, ART_DIRECTION_PREAMBLE } from "@/lib/imagery/prompt";

describe("buildImagePrompt", () => {
  it("includes the art-direction preamble for the brand style", () => {
    const out = buildImagePrompt("a bowl of oats", "warm_lifestyle");
    expect(out).toContain(ART_DIRECTION_PREAMBLE.warm_lifestyle);
    expect(out).toContain("a bowl of oats");
  });

  it("always appends the safety guardrail suffix", () => {
    const out = buildImagePrompt("anything", "cinematic");
    expect(out).toContain(GUARDRAIL_SUFFIX);
  });

  it("falls back to warm_lifestyle for an unknown style", () => {
    const out = buildImagePrompt("scene", "bogus" as never);
    expect(out).toContain(ART_DIRECTION_PREAMBLE.warm_lifestyle);
  });

  it("returns guardrail-only baseline when scene is empty", () => {
    const out = buildImagePrompt("", "warm_lifestyle");
    expect(out).toContain(GUARDRAIL_SUFFIX);
  });
});
