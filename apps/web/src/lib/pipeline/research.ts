// apps/web/src/lib/pipeline/research.ts
import "server-only";

export interface ResearchResult {
  /** Free-text local/competitor/analytics context for the writer, or null. */
  summary: string | null;
}

/**
 * Seam for the future research/competitor/analytics brain. Minimal now: returns
 * no extra context. Later implementations enrich this without changing callers.
 */
export async function getResearch(_brandId: string, _date: Date): Promise<ResearchResult> {
  return { summary: null };
}
