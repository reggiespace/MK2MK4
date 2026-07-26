import { describe, expect, it } from "vitest";
import { MANIFESTS } from "../manifests";
import { suggestImagePrompt } from "../image-prompt";
import type { TemplateStyleId } from "../types";

/**
 * The picker's prompt field starts from this. An empty return means the user
 * faces a blank textarea and generates nothing, which is the state these
 * replace — so the load-bearing assertion is that every format with an image
 * slot produces something.
 */

describe("suggestImagePrompt", () => {
  it("returns the AI's own prompt untouched when the frame carries one", () => {
    // Photo templates declare an `imagePrompt` slot and the model fills it.
    // Nothing derived should ever override a considered prompt.
    const explicit = "A bowl of lentils on a linen cloth, morning light through a kitchen window.";
    expect(
      suggestImagePrompt({
        style: "photo",
        slide: { kind: "1a-lifestyle", f: { imagePrompt: explicit, headline: "Ignored" } },
        topic: "fibre",
      }),
    ).toBe(explicit);
  });

  it("derives a prompt from the frame's own copy for formats with no prompt slot", () => {
    const out = suggestImagePrompt({
      style: "reel",
      slide: { kind: "1a-statement", f: { statement: "Protein first, every time" } },
      brand: "Gastric IQ",
    });
    expect(out).toContain("Protein first, every time");
    expect(out).toContain("9:16");
    expect(out).toContain("Gastric IQ");
    // The negative constraints matter: text baked into the image fights the
    // renderer's own type and can't be edited afterwards.
    expect(out).toContain("no text");
  });

  it("gives every format a non-empty prompt from a plain headline", () => {
    for (const style of Object.keys(MANIFESTS) as TemplateStyleId[]) {
      const kind = Object.keys(MANIFESTS[style].kinds)[0];
      const out = suggestImagePrompt({
        style,
        slide: { kind, f: { headline: "Late dumping is a blood sugar problem" } },
        topic: "dumping syndrome",
      });
      expect(out.length, `${style} produced an empty prompt`).toBeGreaterThan(40);
      expect(out, `${style} dropped the subject`).toContain("Late dumping");
    }
  });

  it("falls back to the draft topic when the frame has no copy yet", () => {
    const out = suggestImagePrompt({
      style: "carousel",
      slide: { kind: "1a-hook", f: {} },
      topic: "hydration after surgery",
    });
    expect(out).toContain("hydration after surgery");
  });

  it("returns nothing when there is no subject at all", () => {
    // Better an empty field than a prompt for a generic stock photo.
    expect(suggestImagePrompt({ style: "carousel", slide: { kind: "1a-hook", f: {} } })).toBe("");
    expect(suggestImagePrompt({ style: "carousel", slide: undefined, topic: "x" })).toBe("");
  });

  it("prefers a headline over a kicker when the frame has both", () => {
    const out = suggestImagePrompt({
      style: "single",
      slide: { kind: Object.keys(MANIFESTS.single.kinds)[0], f: { kicker: "MYTH", headline: "You must eat less" } },
    });
    expect(out).toContain("You must eat less");
    expect(out.startsWith("MYTH")).toBe(false);
  });
});
