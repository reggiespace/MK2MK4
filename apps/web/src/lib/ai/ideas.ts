import "server-only";
import { completeJson } from "./client";
import { COLD_VIEWER, HOOK_LIBRARY, RANKING_SIGNALS, SEND_TRIGGER, rotateHookFormulas } from "./playbook";
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
    `\n${SEND_TRIGGER}`,
    `\n${COLD_VIEWER}`,
    `\n${HOOK_LIBRARY}`,
    // A topic is chosen before a single line is written, so the distribution
    // decisions that matter most are made here rather than in the draft.
    `\nWHAT A GOOD TOPIC IS
A topic is not a subject area — it is a promise to a specific person in a specific
situation, narrow enough that they recognise themselves and want the answer now.
"Protein timing" is a subject. "Why your protein target fails on the days you feel sick"
is a topic. Judge every candidate on whether it could earn a save, a send or a full
watch; if the honest answer is only a like, it is not worth pitching.`,
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
    `- title: the topic already written as a hook — 5–8 words, ≤ 60 chars, opening a curiosity gap. Specific beats generic every time, so every title carries at least one of: a number, a timeframe, or a named situation. "5 shifts that saved me 10 hrs/week" and "the week-three stall nobody warns you about", never "productivity tips".`,
    `- angle: one sentence covering three things — the situation the reader is in when this lands, the one person they would forward it to, and what they keep it for. Name the recipient concretely ("whoever told them it gets easier at week four"), never "their friends".`,
    `- format: the style that suits it best — carousel, reel, story, single or photo.`,
    ``,
    `Before you commit to an idea, decide which single signal it is built to earn — a save, a send, or a full watch — and make the angle consistent with that choice. A reference someone returns to is a save; a line someone forwards on someone else's behalf is a send; a story that only pays off at the end is a watch. An idea built for all three is built for none.`,
    ``,
    `Use a different hook formula for each title; work through ${spread.join(", ")} in that order unless a topic genuinely fights it.`,
    ``,
    `Pick the format from the mechanic, not from habit:`,
    `- carousel — the idea has 5–8 separable steps or points, each worth a swipe, and the last one is worth saving. It also gets re-served on its second slide, so it suits ideas with two independent entry points.`,
    `- reel — the idea genuinely carries 30–90 seconds of spoken narration and opens with something that lands in under 3 seconds. If it is really one sentence, it is not a reel.`,
    `- story — the idea is a question worth asking existing followers, answered by a tap or a reply. Stories reach no new people, so never put a topic here that deserves reach.`,
    `- single / photo — one idea, whole, that loses nothing by having no second surface.`,
    ``,
    `Vary the formats. Avoid topics that are near-duplicates of each other, and avoid any topic that only makes sense to someone who already follows this account.`,
  ].join("\n");

  const raw = (await completeJson(workspaceId, "topic_ideas", IDEAS_SCHEMA, system, user)) as {
    ideas?: SuggestedIdea[];
  };

  return (raw.ideas ?? []).slice(0, count);
}
