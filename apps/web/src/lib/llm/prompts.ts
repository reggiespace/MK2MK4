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

Each idea: a punchy title, a one-sentence angle, a recommended format (single | carousel | reel | story), and the pillar it belongs to.
Reels suit step-by-step or "why this happens" explainers; carousels suit multi-point education; single images suit one strong stat or reframe; stories suit quick, timely reminders or a 1-3 frame tip.

Respond as JSON: { "ideas": [ { "title", "angle", "recommendedFormat", "pillarName" } ] }`,
  };
}

export function draftPrompt(
  brand: BrandContext,
  opts: { title: string; angle: string; format?: string; story?: import("./types").StoryBrief },
): { system: string; user: string } {
  const storyBlock = opts.story
    ? `\nStory to tell: ${opts.story.story}\nKey message: ${opts.story.keyMessage}\nBeats: ${opts.story.beats.join(" → ")}\nCTA intent: ${opts.story.ctaIntent}\n`
    : "";
  return {
    system: brandPreamble(brand),
    user: `Write a complete post for this idea:
Title: ${opts.title}
Angle: ${opts.angle}
${opts.format ? `Preferred format: ${opts.format}` : ""}${storyBlock}

Produce:
- caption: link-free caption (light tasteful emoji), value-first, no medical claims. End with a nudge, not a URL (EN "Try it free — link in the first comment 👇" / PT "É grátis pra testar — link no primeiro comentário 👇").
- firstComment: the app link + one post-specific question, exactly:
  "<EN: Everything's free to try 👇 / PT: Tudo grátis pra testar 👇>
  📲 gastric-iq.com/app
  <one short engagement question in the post's language>"
- hashtags: 4-8 relevant hashtags (no leading #).
- recommendedFormat: single | carousel | reel | story + formatRationale (one sentence).
- slides: ordered slides.
  - "carousel": 1 cover (eyebrow + short headline), 2-4 body (eyebrow + headline + 1-2 sentence body), 1 cta (headline = call to action).
  - "single": exactly 1 cover (eyebrow + headline).
  - "reel": 1 cover (the hook — ≤8 words, must land instantly even with sound off, no throat-clearing), 2-4 body scenes (headline per scene, one idea each), 1 cta (headline = a specific engagement ask, e.g. "Send this to someone still counting calories" — never a generic "thoughts?") + a "voiceover" field with the full narration covering every scene.
  - "story": 1-3 full-screen frames (eyebrow + short headline, optional 1-sentence body); last frame is a cta.

Respond as JSON matching:
{ "caption", "firstComment", "hashtags": [], "recommendedFormat", "formatRationale", "slides": [ { "role": "cover|body|cta", "eyebrow", "headline", "body", "imagePrompt": "short literal scene description for a background photo — food, ingredients, calm lifestyle objects; no people's bodies, no medical content, no text" } ], "voiceover" }`,
  };
}

export function storyPrompt(
  brand: BrandContext,
  opts: { pillarName: string; research?: string; title?: string; angle?: string },
): { system: string; user: string } {
  return {
    system: brandPreamble(brand),
    user: `You are the writer. Decide the single story this post should tell today.
Pillar: "${opts.pillarName}".
${opts.research ? `Research / local context to weave in where natural:\n${opts.research}` : "No special local context today."}
${opts.title ? `Working title: ${opts.title}` : ""}
${opts.angle ? `Working angle: ${opts.angle}` : ""}

Respond as JSON:
{ "story": "1-2 sentences naming the narrative", "keyMessage": "the one thing the viewer should remember", "beats": ["ordered beat", "..."], "ctaIntent": "what we want them to do, framed as process not outcome" }`,
  };
}
