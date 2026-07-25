"use client";

import { Icon } from "@/components/ui/Icon";
import type { SuggestedIdea } from "@/lib/ai/ideas";
import { display, kicker, textArea } from "../styles";

/**
 * Step 4 — content-pillar chips, a free-text theme, and AI topic pitches.
 * Tapping a pillar or an idea fills the topic field.
 */
export function TopicStep({
  pillars,
  pillar,
  topic,
  ideas,
  suggesting,
  onPickPillar,
  onTopicChange,
  onSuggest,
  onPickIdea,
}: {
  pillars: { id: string; name: string }[];
  pillar: string | null;
  topic: string;
  ideas: SuggestedIdea[] | null;
  suggesting: boolean;
  onPickPillar: (name: string) => void;
  onTopicChange: (value: string) => void;
  onSuggest: () => void;
  onPickIdea: (idea: SuggestedIdea) => void;
}) {
  return (
    <div style={{ animation: "fadeUp .35s ease both", maxWidth: "640px" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>What&rsquo;s it about?</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          Give a theme, tap a content pillar, or let AI suggest a topic.
        </p>
      </div>

      <div style={{ ...kicker, marginBottom: "10px" }}>Content pillars</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "22px" }}>
        {pillars.map((p) => {
          const on = p.name === pillar;
          return (
            <button
              key={p.id}
              onClick={() => onPickPillar(p.name)}
              style={{
                padding: "8px 15px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                background: on ? "var(--slate)" : "var(--surface)",
                color: on ? "#fff" : "var(--ink)",
              }}
            >
              {p.name}
            </button>
          );
        })}
        {!pillars.length ? (
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>
            No pillars yet — add them in Settings → Content pillars.
          </span>
        ) : null}
      </div>

      <div style={{ ...kicker, marginBottom: "10px" }}>Theme or topic</div>
      <textarea
        value={topic}
        onChange={(e) => onTopicChange(e.target.value)}
        rows={3}
        placeholder="e.g. Why food noise gets louder mid-cycle — calm, shame-free explainer"
        style={{ ...textArea, fontSize: "14px", padding: "13px 15px", borderRadius: "12px", lineHeight: 1.5 }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "16px 0 4px" }}>
        <button
          className="hover-surface"
          disabled={suggesting}
          onClick={onSuggest}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: "999px",
            padding: "9px 16px",
            fontSize: "13.5px",
            fontWeight: 600,
            color: "var(--slate)",
            cursor: suggesting ? "default" : "pointer",
            opacity: suggesting ? 0.7 : 1,
          }}
        >
          <Icon name="sparkles" size={15} strokeWidth={2.2} />
          {suggesting ? "Thinking…" : "AI suggest topics"}
        </button>
        <span style={{ fontSize: "12.5px", color: "var(--muted)" }}>Not sure? Let AI pitch a few.</span>
      </div>

      {ideas?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
          {ideas.map((idea, i) => {
            const selected = topic === idea.title;
            return (
              <button
                key={`${idea.title}-${i}`}
                className="hover-border"
                onClick={() => onPickIdea(idea)}
                style={{
                  background: "var(--surface)",
                  border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "14px",
                  padding: "14px 16px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", textAlign: "left" }}>
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      marginTop: "2px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: selected ? "var(--accent)" : "transparent",
                      border: selected ? "none" : "1.5px solid var(--border-2)",
                      color: "#f4efe0",
                    }}
                  >
                    {selected ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={display(15.5, 700, { lineHeight: 1.2 })}>{idea.title}</span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9.5px",
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          background: "#e8e2d0",
                          color: "var(--muted)",
                          padding: "2px 7px",
                          borderRadius: "999px",
                          flexShrink: 0,
                        }}
                      >
                        {idea.format}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.5 }}>{idea.angle}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
