import "server-only";
import { completeJson } from "./client";
import { HOOK_LIBRARY, RANKING_SIGNALS, rotateHookFormulas } from "./playbook";
import type { BrandVoice } from "./generate";

export interface SuggestedIdea {
  title: string;
  angle: string;
  /** Suggested style id — carousel | reel | story | single | photo */
  format: string;
}

const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          format: { type: "string", enum: ["carousel", "reel", "story", "single", "photo"] },
        },
        required: ["title", "angle", "format"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

const LANGUAGE: Record<string, string> = {
  en: "English",
  pt_BR: "Brazilian Portuguese (pt-BR)",
};

/** Three topic pitches for the Topic step, in the brand's voice and language. */
export async function suggestIdeas(
  workspaceId: string,
  brand: BrandVoice,
  opts: { pillar?: string | null; count?: number } = {},
): Promise<SuggestedIdea[]> {
  const count = opts.count ?? 3;

  const system = [
    `You are the content strategist for ${brand.name} (${brand.handle}).`,
    `Write in ${LANGUAGE[brand.locale] ?? "English"}.`,
    brand.voiceDescription ? `\nBRAND VOICE\n${brand.voiceDescription}` : "",
    `\n${RANKING_SIGNALS}`,
    `\n${HOOK_LIBRARY}`,
    brand.claimsGuardrail
      ? `\nNever propose a topic that would require claiming the product diagnoses, treats, or prevents anything.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // The pillar (or its absence) seeds the rotation, so successive pillars don't
  // all come back led by the same hook shape.
  const rotated = rotateHookFormulas(opts.pillar ?? brand.handle);
  const spread = rotated.slice(0, count).map((f) => f.name);

  const user = [
    `Pitch ${count} post topics${opts.pillar ? ` for the "${opts.pillar}" content pillar` : ""}.`,
    ``,
    `Each idea needs:`,
    `- title: the topic already written as a hook — 5–8 words, ≤ 60 chars, opening a curiosity gap. Specific beats generic: "5 shifts that saved me 10 hrs/week", never "productivity tips".`,
    `- angle: one sentence on how to treat it, naming the reader's actual situation and what they would save or send it for.`,
    `- format: the style that suits it best — carousel, reel, story, single or photo.`,
    ``,
    `Use a different hook formula for each title; work through ${spread.join(", ")} in that order unless a topic genuinely fights it.`,
    ``,
    `Match the format to the mechanic, not to habit: carousels earn saves and get re-served on their second slide, reels live on watch time and sends, stories build the relationship through taps and replies, single/photo carry one idea whole.`,
    `Vary the formats. Avoid topics that are near-duplicates of each other.`,
  ].join("\n");

  const raw = (await completeJson(workspaceId, "topic_ideas", IDEAS_SCHEMA, system, user)) as {
    ideas?: SuggestedIdea[];
  };

  return (raw.ideas ?? []).slice(0, count);
}
