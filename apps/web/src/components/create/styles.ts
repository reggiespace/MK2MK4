import type { CSSProperties } from "react";

/** Shared inline-style helpers carrying the design's exact values. */

export const mono = (size: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: `${size}px`,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  ...extra,
});

export const display = (size: number, weight: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: "var(--font-display)",
  fontSize: `${size}px`,
  fontWeight: weight,
  ...extra,
});

export const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--brass)",
};

export const panel: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
};

export const card: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: "20px",
};

export const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  background: "var(--accent)",
  color: "#f4efe0",
  border: "none",
  borderRadius: "12px",
  padding: "14px 24px",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(92,117,86,.28)",
};

export const ghostButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "8px 14px",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--muted)",
  cursor: "pointer",
};

export const textInput: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "10px 13px",
  background: "#fff",
  fontSize: "13.5px",
  color: "var(--ink)",
  outline: "none",
};

export const textArea: CSSProperties = {
  ...textInput,
  fontFamily: "var(--font-sans)",
  lineHeight: 1.6,
  resize: "vertical",
};

/** Selectable card (account / style / template) with the design's selected state. */
export function selectableCard(selected: boolean, extra?: CSSProperties): CSSProperties {
  return {
    background: "var(--surface)",
    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "16px",
    padding: "16px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    ...extra,
  };
}

/** Status pill colours, matching the design's badge maps. */
export function statusPill(status: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    scheduled: ["var(--info-bg)", "var(--info-fg)"],
    published: ["var(--ok-bg)", "var(--ok-fg)"],
    draft: ["var(--warn-bg)", "var(--warn-fg)"],
    review: ["var(--warn-bg)", "var(--warn-fg)"],
    rendering: ["var(--warn-bg)", "var(--warn-fg)"],
    failed: ["var(--danger-bg)", "var(--danger-fg)"],
  };
  const [bg, fg] = map[status] ?? map.draft;
  return {
    fontFamily: "var(--font-mono)",
    fontSize: "9.5px",
    fontWeight: 600,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    background: bg,
    color: fg,
    padding: "4px 9px",
    borderRadius: "999px",
    flexShrink: 0,
  };
}
