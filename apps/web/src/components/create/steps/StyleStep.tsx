"use client";

import { Icon } from "@/components/ui/Icon";
import { STYLES } from "@/lib/templates/manifests";
import type { TemplateStyleId } from "@/lib/templates/types";
import { display } from "../styles";

/** Step 2 — the five format cards, each previewing its own aspect ratio. */
export function StyleStep({
  style,
  onSelect,
}: {
  style: TemplateStyleId | null;
  onSelect: (id: TemplateStyleId) => void;
}) {
  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Choose a style</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          What kind of post are we making?
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(184px,1fr))", gap: "16px" }}>
        {STYLES.map((st) => {
          const selected = st.id === style;
          return (
            <button
              key={st.id}
              className="hover-border"
              onClick={() => onSelect(st.id as TemplateStyleId)}
              style={{
                background: "var(--surface)",
                border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "16px",
                padding: "12px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  aspectRatio: st.ratio,
                  borderRadius: "10px",
                  background: "linear-gradient(150deg,var(--surface-2),#e5ddc6)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--slate)",
                  maxHeight: "150px",
                  margin: "0 auto",
                }}
              >
                <Icon name={st.icon} size={30} strokeWidth={1.8} />
              </div>
              <div style={{ padding: "12px 4px 2px", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={display(16, 700)}>{st.name}</span>
                  {selected ? (
                    <span
                      style={{
                        width: "19px",
                        height: "19px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                        color: "#f4efe0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="check" size={11} strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "2px" }}>{st.desc}</div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--brass)",
                    fontFamily: "var(--font-mono)",
                    marginTop: "5px",
                    letterSpacing: ".03em",
                  }}
                >
                  {st.meta}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
