import { DEFAULT_VOICE_ID } from "@/lib/ai/voices";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import type { InitialDraft } from "@/components/create/types";

/** Maps a saved `Post` row into the shape StudioWizard needs to resume editing it. */
export function toInitialDraft(
  post: {
    id: string;
    accountId: string;
    style: string;
    archetype: string;
    topic: string | null;
    doc: unknown;
    voiceId: string | null;
    narration: "verbatim" | "condensed";
  },
  pillarName: string | null,
): InitialDraft {
  return {
    postId: post.id,
    accountId: post.accountId,
    style: post.style as TemplateStyleId,
    archetype: post.archetype,
    topic: post.topic ?? "",
    pillar: pillarName,
    doc: post.doc as unknown as PostDoc,
    voiceId: post.voiceId ?? DEFAULT_VOICE_ID,
    narration: post.narration,
  };
}
