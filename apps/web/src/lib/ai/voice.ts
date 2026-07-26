import "server-only";
import { prisma } from "@/lib/db";
import { requireCredential } from "@/lib/integrations";
import { assetKey, saveAsset } from "@/lib/storage";
import { Provider } from "@/generated/prisma/enums";
import { NARRATION_WPM } from "./playbook";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { asText } from "@/lib/templates/types";

/**
 * ElevenLabs narration for Reels and Stories.
 *
 * On-screen text is the script: each frame carries a `voiceScript`, and the
 * concatenated scripts are what gets read aloud.
 */

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

export { VOICES, DEFAULT_VOICE_ID } from "./voices";

/**
 * The lines that will be read, in frame order.
 *
 * `verbatim` reads each frame's script as written. `condensed` trims each line
 * to its first sentence so the read tracks the on-screen text without
 * over-running short frames.
 */
export function assembleScript(
  style: TemplateStyleId,
  doc: PostDoc,
  narration: "verbatim" | "condensed",
): string[] {
  const man = getManifest(style);
  const lines: string[] = [];

  doc.slides.forEach((slide) => {
    const kind = man.kinds[slide.kind];
    if (!kind) return;
    const hasVoice = kind.slots.some((s) => s.id === "voiceScript");
    const text = hasVoice
      ? asText(slide.f.voiceScript)
      : // Stories have no voiceScript slot; fall back to the frame's prompt copy.
        asText(slide.f.prompt) || asText(slide.f.headline) || asText(slide.f.caption);
    const trimmed = text.trim();
    if (!trimmed) return;

    if (narration === "condensed") {
      const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0];
      lines.push(firstSentence);
    } else {
      lines.push(trimmed);
    }
  });

  return lines;
}

export interface SynthesizeInput {
  workspaceId: string;
  accountId: string;
  postId: string;
  voiceId: string;
  lines: string[];
}

export interface VoiceTrack {
  assetId: string;
  url: string;
  /** Rough read time, used for the "preview the read" meta line. */
  estimatedSeconds: number;
}

/**
 * Read time at the same pace the reel script budget is derived from, so the
 * duration the prompt asks for and the duration shown in the editor agree.
 */
export function estimateSeconds(lines: string[]): number {
  const words = lines.join(" ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / NARRATION_WPM) * 60));
}

/** Synthesize the assembled script and store it as an audio asset. */
export async function synthesizeVoice(input: SynthesizeInput): Promise<VoiceTrack> {
  const text = input.lines.join("\n\n").trim();
  if (!text) throw new Error("There is no narration script to read yet.");

  const cred = await requireCredential(input.workspaceId, Provider.elevenlabs);

  const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${input.voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": cred.apiKey,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  const bytes = Buffer.from(await res.arrayBuffer());
  const key = assetKey(input.workspaceId, "voice", `${input.postId}-${Date.now()}.mp3`);
  const url = await saveAsset(key, bytes, "audio/mpeg");

  const asset = await prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      name: `Narration · ${new Date().toISOString().slice(0, 10)}`,
      kind: "audio",
      url,
      storageKey: key,
      mimeType: "audio/mpeg",
      bytes: bytes.byteLength,
      ai: true,
      meta: { voiceId: input.voiceId, lines: input.lines.length },
    },
  });

  return { assetId: asset.id, url, estimatedSeconds: estimateSeconds(input.lines) };
}
