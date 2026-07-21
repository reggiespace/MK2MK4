import { z } from "zod";

export const formatEnum = z.enum(["single", "carousel", "reel", "story"]);
export const slideRoleEnum = z.enum(["cover", "body", "cta"]);

export const ideaSchema = z.object({
  title: z.string(),
  angle: z.string(),
  recommendedFormat: formatEnum,
  pillarName: z.string().nullable().optional(),
});
export const ideasResponseSchema = z.object({
  ideas: z.array(ideaSchema).min(1),
});
export type Idea = z.infer<typeof ideaSchema>;

export const storyBriefSchema = z.object({
  story: z.string(),
  keyMessage: z.string(),
  beats: z.array(z.string()).default([]),
  ctaIntent: z.string(),
});
export type StoryBrief = z.infer<typeof storyBriefSchema>;

export const draftSlideSchema = z.object({
  role: slideRoleEnum,
  eyebrow: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  imagePrompt: z.string().nullable().optional(),
});
export const draftResponseSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  recommendedFormat: formatEnum,
  formatRationale: z.string(),
  slides: z.array(draftSlideSchema).min(1),
  firstComment: z.string().nullable().optional(),
  /** Narration script for reels (omitted for single/carousel). */
  voiceover: z.string().nullable().optional(),
});
export type DraftResponse = z.infer<typeof draftResponseSchema>;

export interface BrandContext {
  name: string;
  locale: "en" | "pt_BR";
  toneGuide: string;
  pillars: { name: string; description: string }[];
}
