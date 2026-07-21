import "server-only";
import type { JobKind } from "@/generated/prisma/enums";

/**
 * Single source of truth for the worker render payload, shared by the HTTP
 * render route and the cron/autopilot enqueue path so they never drift.
 * Resolves the effective template (per-piece override → brand default →
 * bold_highlight) and the brand's public handle.
 */

const HANDLES: Record<string, string> = {
  "gastric-us": "@gastric_iq",
  "gastric-br": "@gastric_iq_brasil",
};

export function brandHandle(brand: { key: string; locale: string }): string {
  return HANDLES[brand.key] ?? (brand.locale === "pt_BR" ? "@gastric_iq_brasil" : "@gastric_iq");
}

export function renderKindFor(format: string): JobKind {
  return (format === "single" ? "image" : format) as JobKind;
}

interface SlideForRender {
  index: number;
  role: string;
  skin: string;
  eyebrow: string | null;
  headline: string | null;
  body: string | null;
  imagePrompt: string | null;
}

interface PieceForRender {
  id: string;
  template: string | null;
  voiceover: string | null;
  voiceGender: string | null;
  motion: boolean;
  slides: SlideForRender[];
  brand: {
    key: string;
    locale: string;
    brandKit: {
      logoPath: string | null;
      tokens: unknown;
      fonts: unknown;
      defaultSkin: string | null;
      defaultTemplate: string | null;
      artDirection: string | null;
      voiceId: string | null;
    } | null;
  };
}

export function buildRenderPayload(piece: PieceForRender, jobId: string, kind: string) {
  const template =
    piece.template ?? piece.brand.brandKit?.defaultTemplate ?? "bold_highlight";
  return {
    jobId,
    pieceId: piece.id,
    kind,
    template,
    handle: brandHandle(piece.brand),
    slides: piece.slides.map((s) => ({
      index: s.index,
      role: s.role,
      skin: s.skin,
      eyebrow: s.eyebrow,
      headline: s.headline,
      body: s.body,
      imagePrompt: s.imagePrompt,
    })),
    brandKit: {
      logoPath: piece.brand.brandKit?.logoPath ?? "",
      tokens: piece.brand.brandKit?.tokens,
      fonts: piece.brand.brandKit?.fonts,
      defaultSkin: piece.brand.brandKit?.defaultSkin,
      defaultTemplate: template,
      artDirection: piece.brand.brandKit?.artDirection ?? "warm_lifestyle",
      voiceId: piece.brand.brandKit?.voiceId ?? "",
    },
    voiceover: piece.voiceover,
    locale: piece.brand.locale,
    voiceGender: piece.voiceGender ?? "female",
    motion: piece.motion,
  };
}
