import "server-only";

export interface CadenceRow {
  weekday: number;
  pillar: string;
  format: "single" | "carousel" | "reel" | "story";
  networks: string[];
}

/** The day's cadence entry, or null if the brand doesn't post that weekday. */
export function pickCadence(rows: CadenceRow[], when: Date): CadenceRow | null {
  const wd = when.getUTCDay();
  return rows.find((r) => r.weekday === wd) ?? null;
}

/** Normalize to a UTC date at midnight — the ContentRun dedupe key. */
export function runDateUTC(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}
