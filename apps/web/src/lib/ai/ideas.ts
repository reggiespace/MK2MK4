import "server-only";
import { completeJson } from "./client";
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
    brand.claimsGuardrail
      ? `\nNever propose a topic that would require claiming the product diagnoses, treats, or prevents anything.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Pitch ${count} post topics${opts.pillar ? ` for the "${opts.pillar}" content pillar` : ""}.`,
    ``,
    `Each idea needs:`,
    `- title: a specific, scroll-stopping topic (≤ 60 chars). Not a generic category.`,
    `- angle: one sentence on how to treat it, naming the reader's actual situation.`,
    `- format: the style that suits it best — carousel, reel, story, single or photo.`,
    ``,
    `Vary the formats. Avoid topics that are near-duplicates of each other.`,
  ].join("\n");

  const raw = (await completeJson(workspaceId, "topic_ideas", IDEAS_SCHEMA, system, user)) as {
    ideas?: SuggestedIdea[];
  };

  return (raw.ideas ?? []).slice(0, count);
}
