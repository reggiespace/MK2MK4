import type { SlideContext } from "@/components/slide/Slide";
import type { TemplateStyleId } from "@/lib/templates/types";

/**
 * Building a `SlideContext` from a brand account row.
 *
 * Six surfaces draw slides from the database — Pieces, the piece detail, the
 * dashboard, the render route, and both wizard previews — and each used to spell
 * the mapping out inline. That was fine until the context grew a field the
 * account only carries through a relation: adding `logoUrl` meant finding every
 * `include` and every literal. One helper and one include fragment instead, so
 * the next field is a single edit.
 */

/**
 * Prisma `include` for the account relation on a post. The logo lives on a
 * joined Asset, so a query that forgets this silently renders the monogram
 * fallback for a brand that has a mark set.
 */
export const ACCOUNT_WITH_LOGO = {
  include: { logoAsset: { select: { url: true } } },
} as const;

export interface SlideAccount {
  accent: string;
  name: string;
  handle: string;
  initials: string;
  logoAsset?: { url: string } | null;
}

export function slideCtx(style: TemplateStyleId, account: SlideAccount): SlideContext {
  return {
    style,
    accent: account.accent,
    brand: account.name,
    handle: account.handle,
    initials: account.initials,
    logoUrl: account.logoAsset?.url ?? null,
  };
}
