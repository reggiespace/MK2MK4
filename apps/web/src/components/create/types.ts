import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import type { SuggestedIdea } from "@/lib/ai/ideas";

export interface WizardChannel {
  id: string;
  platform: string;
  handle: string;
  externalId: string | null;
}

export interface WizardAccount {
  id: string;
  name: string;
  locale: string;
  handle: string;
  initials: string;
  mark: string;
  accent: string;
  channels: WizardChannel[];
  pillars: { id: string; name: string }[];
}

export type GenPhase = "idle" | "writing" | "assets" | "done";
export type EditorTab = "slides" | "voice" | "post";

/** The wizard's whole state, mirroring the design's component state. */
export interface WizardState {
  step: number;
  maxStep: number;
  accountId: string;
  /** Platforms this post publishes to, per account. */
  channels: Record<string, string[]>;
  style: TemplateStyleId | null;
  arch: string | null;
  topic: string;
  pillar: string | null;
  ideas: SuggestedIdea[] | null;
  suggesting: boolean;
  genPhase: GenPhase;
  postId: string | null;
  doc: PostDoc | null;
  activeSlide: number;
  editorTab: EditorTab;
  voiceId: string;
  narration: "verbatim" | "condensed";
  when: "best" | "custom";
  customTime: string;
  scheduled: boolean;
  error: string | null;
}
