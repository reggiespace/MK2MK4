import "server-only";

export const IG_CAPTION_MAX = 2200;
export const FB_CAPTION_MAX = 63206;

const MAX_BY_NETWORK: Record<string, number> = {
  instagram: IG_CAPTION_MAX,
  facebook: FB_CAPTION_MAX,
};

export function captionWithinLimit(
  caption: string,
  networks: string[],
): { ok: boolean; overBy: number } {
  let worst = 0;
  for (const n of networks) {
    const max = MAX_BY_NETWORK[n] ?? IG_CAPTION_MAX;
    worst = Math.max(worst, caption.length - max);
  }
  return { ok: worst <= 0, overBy: Math.max(0, worst) };
}
