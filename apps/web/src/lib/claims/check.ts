/**
 * Health-brand claims-check engine.
 *
 * Rules derived from the Gastric IQ marketing guardrails
 * (gastric-iq/marketing-plan.md §7 and gastric-iq-2/marketing.md §9).
 *
 * Levels:
 *  - block: must be removed before a piece can be scheduled.
 *  - warn:  should be softened; may carry an auto-fix.
 *  - pass:  informational confirmations shown green in Review.
 *
 * Pure + deterministic so it runs anywhere (no network). Used at draft time and
 * again as the hard gate on the Review screen.
 */

export type ClaimLevel = "block" | "warn" | "pass";

export interface ClaimFinding {
  id: string;
  level: ClaimLevel;
  message: string;
  match?: string;
  /** A safer phrasing suggestion shown to the operator. */
  suggestion?: string;
  /** When present, an exact replacement that can be auto-applied. */
  autoFix?: { find: string; replace: string };
}

export interface ClaimsResult {
  findings: ClaimFinding[];
  blocks: number;
  warns: number;
  canSchedule: boolean;
}

interface Rule {
  id: string;
  level: Exclude<ClaimLevel, "pass">;
  pattern: RegExp;
  message: string;
  suggestion?: string;
  /** Build an auto-fix replacement from the matched text. */
  fix?: (match: string) => string;
}

const BLOCK_RULES: Rule[] = [
  {
    id: "prevents-symptoms",
    level: "block",
    pattern: /\bprevent(s|ing)?\s+(nausea|side[-\s]?effects?|vomiting|reflux)\b/i,
    message: 'Implies preventing side effects — not allowed. Reframe (e.g. "may feel more comfortable").',
  },
  {
    id: "prevents-muscle-loss",
    level: "block",
    pattern: /\bprevent(s|ing)?\s+muscle\s+loss\b/i,
    message: 'Cannot claim it prevents muscle loss. Use "supports lean-mass awareness".',
  },
  {
    id: "causes-weight-loss",
    level: "block",
    pattern: /\b(causes?\s+weight\s+loss|lose\s+weight\s+with\s+gastric\s*iq|makes?\s+you\s+lose\s+weight)\b/i,
    message: "Cannot claim Gastric IQ causes weight loss.",
  },
  {
    id: "cure",
    level: "block",
    pattern: /\bcure(s|d)?\b/i,
    message: 'No "cure" claims for a health brand.',
  },
  {
    id: "diagnose",
    level: "block",
    pattern: /\bdiagnos(e|es|is|ing)\b/i,
    message: 'No diagnosis claims. Use "see your patterns" / "discuss with your clinician".',
  },
  {
    id: "replaces-medical-advice",
    level: "block",
    pattern: /\b(replace|replaces|instead of)\s+(your\s+)?(doctor|clinician|medical advice)\b/i,
    message: "Never imply it replaces medical advice.",
  },
  {
    id: "ai-doctor",
    level: "block",
    pattern: /\bai\s+doctor\b/i,
    message: 'No "AI doctor" framing — it is pattern-matching, not medical advice.',
  },
  {
    id: "hipaa",
    level: "block",
    pattern: /\bHIPAA\s+compliant\b/i,
    message: 'Do not claim "HIPAA compliant".',
  },
  {
    id: "better-than-competitor",
    level: "block",
    pattern: /\bbetter\s+than\s+(shotsy|pep|meagain|phaze|phaze)\b/i,
    message: "Avoid direct competitor attacks — use comparison framing.",
  },
  {
    id: "unlimited-free",
    level: "block",
    pattern: /\bunlimited\s+everything\b/i,
    message: 'Do not claim "unlimited everything for free" — be specific about what is free.',
  },
];

const WARN_RULES: Rule[] = [
  {
    id: "measured-gastric",
    level: "warn",
    pattern: /\bmeasured\s+(stomach|gastric)\b/i,
    message: 'Say "model-estimated gastric load", not "measured".',
    suggestion: "model-estimated gastric load",
    fix: () => "model-estimated gastric load",
  },
  {
    id: "shame-language",
    level: "warn",
    pattern: /\byou\s+(missed|failed|messed up|cheated)\b/i,
    message: "Shame/judgment language — rephrase value-first.",
  },
  {
    id: "expected-symptom",
    level: "warn",
    pattern: /\b(?<!often\s)expected\b(?=[^.]*\b(nausea|hunger|food noise|symptom)\b)/i,
    message: 'Soften absolute "expected" near symptoms to "often expected".',
    suggestion: "often expected",
    fix: (m) => `often ${m}`,
  },
];

const ALL_RULES = [...BLOCK_RULES, ...WARN_RULES];

/** Join a caption + slide headlines/bodies into the text the claims gate should scan. */
export function fullTextForClaims(
  caption: string,
  slides: { headline?: string | null; body?: string | null }[],
): string {
  const slideText = slides
    .map((s) => [s.headline, s.body].filter(Boolean).join(" "))
    .join(" ");
  return [caption, slideText].filter(Boolean).join(" ");
}

/** Run the claims check over arbitrary post text (caption + slide text joined). */
export function checkClaims(text: string): ClaimsResult {
  const findings: ClaimFinding[] = [];

  for (const rule of ALL_RULES) {
    const m = rule.pattern.exec(text);
    if (m) {
      const matched = m[0];
      findings.push({
        id: rule.id,
        level: rule.level,
        message: rule.message,
        match: matched,
        suggestion: rule.suggestion,
        autoFix: rule.fix ? { find: matched, replace: rule.fix(matched) } : undefined,
      });
    }
  }

  // Informational pass: confirm safe qualifier when gastric load is mentioned.
  if (/gastric\s+load|stomach\s+(fullness|load)/i.test(text)) {
    const safe = /model[-\s]?estimated/i.test(text);
    findings.push({
      id: "gastric-qualifier",
      level: safe ? "pass" : "warn",
      message: safe
        ? 'Uses "model-estimated" qualifier for gastric load.'
        : 'Mentions gastric load without the "model-estimated" qualifier.',
      suggestion: safe ? undefined : 'Add "model-estimated".',
    });
  }

  if (!/\b(missed|failed|cheated|bad day)\b/i.test(text)) {
    findings.push({
      id: "no-shame",
      level: "pass",
      message: "No shame/judgment language detected.",
    });
  }

  const blocks = findings.filter((f) => f.level === "block").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  return { findings, blocks, warns, canSchedule: blocks === 0 };
}

/** Apply all available auto-fixes to a text and return the result. */
export function applyAutoFixes(text: string): string {
  let out = text;
  for (const rule of WARN_RULES) {
    if (!rule.fix) continue;
    const m = rule.pattern.exec(out);
    if (m) out = out.replace(m[0], rule.fix(m[0]));
  }
  return out;
}
