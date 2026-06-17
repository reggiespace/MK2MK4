export type ArtDirection = "warm_lifestyle" | "editorial_illustration" | "cinematic";

export const ART_DIRECTION_PREAMBLE: Record<ArtDirection, string> = {
  warm_lifestyle:
    "Warm, bright editorial lifestyle photography. Natural light, shallow depth of field, fresh whole foods and calm wellness scenes.",
  editorial_illustration:
    "Modern editorial illustration, soft flat shapes, organic linework, calm earthy palette (moss green, slate blue, cream).",
  cinematic:
    "Cinematic still, soft directional light, gentle film grain, muted earthy palette, tasteful and trustworthy mood.",
};

// Strict guardrails for a health brand — these subjects must never be depicted.
export const GUARDRAIL_SUFFIX =
  "Do not depict: human bodies in before/after or weight-loss contexts, weighing scales or weight numbers, " +
  "medical or clinical settings, pills/syringes/medical devices, or any specific health outcome. " +
  "No text, words, letters, logos, or watermarks anywhere in the image.";

/** Compose the final fal.ai prompt from a slide scene + brand art direction. */
export function buildImagePrompt(scene: string, artDirection: ArtDirection): string {
  const preamble = ART_DIRECTION_PREAMBLE[artDirection] ?? ART_DIRECTION_PREAMBLE.warm_lifestyle;
  const subject = scene.trim() ? `Scene: ${scene.trim()}.` : "Scene: abstract on-brand background texture.";
  return `${preamble} ${subject} ${GUARDRAIL_SUFFIX}`;
}
