"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { previewScriptAction, synthesizeVoiceAction } from "@/app/actions/create";
import { VOICES } from "@/lib/ai/voice";

/**
 * The Voice tab (Reels and Stories). On-screen text is the narration script,
 * so the assembled read is derived from the doc rather than typed separately.
 */
export function VoiceEditor({
  postId,
  voiceId,
  narration,
  docVersion,
  onVoiceId,
  onNarration,
  onToast,
}: {
  postId: string | null;
  voiceId: string;
  narration: "verbatim" | "condensed";
  /** Bumped whenever the doc changes, so the script list refreshes. */
  docVersion: number;
  onVoiceId: (id: string) => void;
  onNarration: (n: "verbatim" | "condensed") => void;
  onToast: (message: string) => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep the script list in step with the doc and the verbatim/condensed toggle.
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    previewScriptAction(postId, narration).then((res) => {
      if (cancelled || !res.ok) return;
      setLines(res.data.lines);
      setSeconds(res.data.estimatedSeconds);
    });
    return () => {
      cancelled = true;
    };
  }, [postId, narration, docVersion]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function previewRead() {
    if (!postId) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await synthesizeVoiceAction({ postId, voiceId, narration });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLines(res.data.lines);
    setSeconds(res.data.estimatedSeconds);

    const audio = new Audio(res.data.url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    await audio.play();
    setPlaying(true);
    onToast("Narration ready");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "13px 15px",
        }}
      >
        <span style={{ display: "flex", color: "var(--slate)", marginTop: "1px" }}>
          <Icon name="wave" size={16} strokeWidth={2.4} />
        </span>
        <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5 }}>
          On-screen text is the narration script. ElevenLabs reads it aloud over your frames.
        </div>
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--brass)",
            marginBottom: "9px",
          }}
        >
          Voice
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {VOICES.map((v) => {
            const on = v.id === voiceId;
            return (
              <button
                key={v.id}
                onClick={() => onVoiceId(v.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  background: "var(--surface)",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "12px",
                  padding: "11px 13px",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: on ? "var(--accent)" : "var(--border-2)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ textAlign: "left", flex: 1 }}>
                  <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--ink)" }}>
                    {v.name}
                  </span>
                  <span style={{ display: "block", fontSize: "11.5px", color: "var(--muted)" }}>{v.desc}</span>
                </span>
                {on ? (
                  <span style={{ color: "var(--accent)", display: "flex" }}>
                    <Icon name="check" size={15} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--brass)",
            marginBottom: "9px",
          }}
        >
          On-screen text
        </div>
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "4px",
            gap: "2px",
          }}
        >
          {(["verbatim", "condensed"] as const).map((n) => {
            const on = n === narration;
            return (
              <button
                key={n}
                onClick={() => onNarration(n)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  textTransform: "capitalize",
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#f4efe0" : "var(--muted)",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <button
            onClick={previewRead}
            disabled={busy || !postId || !lines.length}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              border: "none",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy || !lines.length ? "default" : "pointer",
              background: busy || !lines.length ? "var(--border-2)" : "var(--accent)",
              color: "#f4efe0",
            }}
          >
            {busy ? (
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: "2px solid rgba(244,239,224,.4)",
                  borderTopColor: "#f4efe0",
                  animation: "spin .8s linear infinite",
                }}
              />
            ) : (
              <Icon name={playing ? "pause" : "play"} size={15} strokeWidth={2.4} />
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
              {busy ? "Synthesizing…" : playing ? "Playing" : "Preview the read"}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
              {lines.length} {lines.length === 1 ? "line" : "lines"} · ~{seconds}s
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", gap: "2px", height: "22px" }}>
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                style={{
                  width: "3px",
                  height: "100%",
                  borderRadius: "2px",
                  background: playing ? "var(--accent)" : "var(--border-2)",
                  transformOrigin: "bottom",
                  animation: playing ? `vpulse ${0.6 + (i % 3) * 0.18}s ease-in-out ${i * 0.07}s infinite` : "none",
                  transform: playing ? undefined : "scaleY(.35)",
                }}
              />
            ))}
          </div>
        </div>

        {error ? (
          <div
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger-fg)",
              borderRadius: "9px",
              padding: "9px 12px",
              fontSize: "12px",
              marginBottom: "10px",
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="thin-scroll" style={{ display: "flex", flexDirection: "column", gap: "9px", maxHeight: "230px", overflowY: "auto" }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9.5px",
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  flexShrink: 0,
                  width: "26px",
                  paddingTop: "2px",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: "12.5px", color: "var(--ink)", lineHeight: 1.5 }}>{line}</span>
            </div>
          ))}
          {!lines.length ? (
            <span style={{ fontSize: "12.5px", color: "var(--muted)" }}>
              Fill the frames&rsquo; voice scripts and the read appears here.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
