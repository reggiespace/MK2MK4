import { describe, expect, it } from "vitest";
import { buildUserPrompt, type BrandVoice } from "../prompt";

/**
 * The brief is the whole point of the agent surface: without it, locale means
 * nothing more than "write in pt-BR" and no amount of research reaches the copy.
 * These tests assert it lands in the prompt, and that the prompt does not break
 * when it is absent (the UI never sends one).
 */
const BRAND: BrandVoice = {
  name: "Gastric IQ Brasil",
  handle: "@gastriciq.br",
  locale: "pt_BR",
  voiceDescription: "Calmo, direto, sem culpa.",
  tones: ["calm"],
  readingLevel: "grade7",
  claimsGuardrail: true,
  downloadUrl: "https://example.test/app",
};

describe("buildUserPrompt", () => {
  it("includes the brief under a labelled heading when one is supplied", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "Festa Junina sem exagero", null, {
      angle: "Comida de festa sem culpa",
      brief: "Festa Junina peaks in late June; pamonha and quentão are the staples.",
    });

    expect(prompt).toContain("RESEARCH BRIEF");
    expect(prompt).toContain("pamonha");
    expect(prompt).toContain("Comida de festa sem culpa");
  });

  it("tells the model the brief is context, not copy to reproduce", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "t", null, {
      brief: "Festa Junina peaks in late June.",
    });
    expect(prompt).toMatch(/do not quote|context|ground/i);
  });

  it("omits the heading entirely when there is no brief", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "t", null, {});
    expect(prompt).not.toContain("RESEARCH BRIEF");
  });

  it("still contains the topic and slide specs with no brief, so the UI path is unchanged", () => {
    const prompt = buildUserPrompt(BRAND, "carousel", ["1a-knockout"], "Protein first", "Nutrition", {});
    expect(prompt).toContain("Protein first");
    expect(prompt).toContain("Nutrition");
    expect(prompt).toContain("SLIDE 0");
  });
});
