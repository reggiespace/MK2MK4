"use client";

import { Icon } from "@/components/ui/Icon";
import { Slide } from "@/components/slide/Slide";
import { SlideScaled } from "@/components/slide/SlideFrame";
import { getManifest } from "@/lib/templates/manifests";
import { sampleSlide } from "@/lib/templates/sample";
import type { TemplateStyleId } from "@/lib/templates/types";
import { display } from "../styles";
import type { WizardAccount } from "../types";

/**
 * Step 3 — one card per cover archetype, each showing a live miniature of that
 * exact layout drawn by the shared renderer. Not an icon grid: the miniature is
 * the same code that renders the final art, filled with sample copy.
 */
export function TemplateStep({
  style,
  arch,
  account,
  onSelect,
}: {
  style: TemplateStyleId;
  arch: string | null;
  account: WizardAccount;
  onSelect: (kind: string) => void;
}) {
  const man = getManifest(style);
  const locale = account.locale === "pt_BR" ? "pt_BR" : "en";
  const covers = man.cover;

  const ctx = {
    style,
    accent: account.accent,
    brand: account.name,
    handle: account.handle,
    initials: account.initials,
    logoUrl: account.logoUrl,
  };

  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Pick a template</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          {covers.length} {man.label} {covers.length === 1 ? "layout" : "layouts"} — the cover sets the tone for
          the whole post.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(206px,1fr))", gap: "18px" }}>
        {covers.map((kind) => {
          const k = man.kinds[kind];
          const selected = kind === arch;
          return (
            <button
              key={kind}
              className="hover-border"
              onClick={() => onSelect(kind)}
              style={{
                background: "var(--surface)",
                border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "16px",
                padding: "10px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ position: "relative", display: "flex", justifyContent: "center", padding: "4px 4px 0" }}>
                <div className="slide-art" style={{ borderRadius: "8px", overflow: "hidden" }}>
                  <SlideScaled style={style} width={style === "reel" || style === "story" ? 108 : 168}>
                    <Slide slide={sampleSlide(style, kind, locale)} index={0} total={5} ctx={ctx} />
                  </SlideScaled>
                </div>
                {selected ? (
                  <span
                    style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "#f4efe0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,.25)",
                    }}
                  >
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </div>
              <div style={{ padding: "12px 6px 3px", textAlign: "left" }}>
                <div style={display(16, 700, { lineHeight: 1.15 })}>{k.name}</div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--brass)",
                    marginTop: "4px",
                  }}
                >
                  {k.role}
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "5px", lineHeight: 1.4 }}>
                  {k.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
