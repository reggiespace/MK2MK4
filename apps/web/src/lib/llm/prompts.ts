import type { BrandContext } from "./types";

const localeName = (l: BrandContext["locale"]) =>
  l === "pt_BR" ? "Brazilian Portuguese (pt-BR)" : "English (US)";

function brandPreamble(brand: BrandContext): string {
  const pillars = brand.pillars
    .map((p) => `- ${p.name}: ${p.description}`)
    .join("\n");
  return `You write social media content for "${brand.name}", a GLP-1 / digestion-health brand.
Write ONLY in ${localeName(brand.locale)}. Transcreate (culturally adapt) — never translate literally.

BRAND VOICE & GUARDRAILS (follow strictly):
${brand.toneGuide}

CONTENT PILLARS:
${pillars}`;
}

export function ideasPrompt(
  brand: BrandContext,
  opts: { count: number; pillarName?: string; brief?: string },
): { system: string; user: string } {
  const focus = opts.pillarName
    ? `Focus on the pillar: "${opts.pillarName}".`
    : "Spread ideas across the pillars.";
  const brief = opts.brief ? `Operator brief to honor: "${opts.brief}".` : "";
  return {
    system: brandPreamble(brand),
    user: `Propose ${opts.count} fresh, specific post ideas. ${focus} ${brief}

Each idea: a punchy title, a one-sentence angle, a recommended format (single | carousel | reel), and the pillar it belongs to.
Reels suit step-by-step or "why this happens" explainers; carousels suit multi-point education; single images suit one strong stat or reframe.

Respond as JSON: { "ideas": [ { "title", "angle", "recommendedFormat", "pillarName" } ] }`,
  };
}

export function draftPrompt(
  brand: BrandContext,
  opts: { title: string; angle: string; format?: string },
): { system: string; user: string } {
  return {
    system: brandPreamble(brand),
    user: `Write a complete post for this idea:
Title: ${opts.title}
Angle: ${opts.angle}
${opts.format ? `Preferred format: ${opts.format}` : ""}

Produce:
- caption: the post caption (with light, tasteful emoji where natural), value-first, no medical claims.
- hashtags: 4-8 relevant hashtags (no leading # needed).
- recommendedFormat: single | carousel | reel (confirm or improve on the preferred format) + formatRationale (one sentence).
- slides: ordered slides.
  - For "carousel": 1 cover (eyebrow + short headline), 2-4 body slides (eyebrow + headline + 1-2 sentence body), 1 cta slide (headline = call to action).
  - For "single": exactly 1 cover slide (eyebrow + headline).
  - For "reel": 3-6 body slides as on-screen scene text (headline per scene), plus a "voiceover" field with the full spoken narration.

Respond as JSON matching:
{ "caption", "hashtags": [], "recommendedFormat", "formatRationale", "slides": [ { "role": "cover|body|cta", "eyebrow", "headline", "body" } ], "voiceover" }`,
  };
}
