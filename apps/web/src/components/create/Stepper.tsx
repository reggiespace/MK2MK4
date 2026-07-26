"use client";

import { Icon } from "@/components/ui/Icon";

export const STEP_LABELS = ["Account", "Style", "Template", "Topic", "Create", "Review"] as const;

/**
 * Six numbered pill steps joined by connector lines. Steps are clickable only
 * once reached — `maxStep` gates forward jumps so the wizard can't be skipped.
 */
export function Stepper({
  step,
  maxStep,
  onGo,
}: {
  step: number;
  maxStep: number;
  onGo: (n: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexWrap: "wrap",
        marginBottom: "28px",
        paddingBottom: "22px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {STEP_LABELS.map((label, idx) => {
        const done = idx < maxStep && idx !== step;
        const active = idx === step;
        const reachable = idx <= maxStep;

        return (
          <div key={label} style={{ display: "contents" }}>
            {idx > 0 ? (
              <span
                style={{
                  width: "26px",
                  height: "1.5px",
                  background: idx <= maxStep ? "var(--moss)" : "var(--border)",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onGo(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 9px",
                borderRadius: "999px",
                border: "none",
                cursor: reachable ? "pointer" : "default",
                background: active ? "var(--surface)" : "transparent",
              }}
            >
              <span
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: done ? "var(--moss)" : active ? "var(--accent)" : "var(--border)",
                  color: done || active ? "#f4efe0" : "var(--muted)",
                }}
              >
                {done ? <Icon name="check" size={13} strokeWidth={3} /> : idx + 1}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--ink)" : "var(--muted)",
                }}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
