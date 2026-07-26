"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { stickerPlan, stickerPlanText } from "@/lib/templates/stickers";
import type { PostDoc } from "@/lib/templates/types";
import { kicker, mono } from "@/components/create/styles";

/**
 * The story sticker checklist.
 *
 * Rendered art is a picture of a poll; the tappable one has to be placed by hand
 * in Instagram when the story goes up, because no publishing API can place it.
 * This is the handoff — what to place on which frame and what to type into it.
 * Shown on Review before scheduling and again on the piece detail, since the
 * person posting is not always the person who drafted.
 */
export function StickerPlan({ style, doc }: { style: string; doc: PostDoc }) {
  const [copied, setCopied] = useState(false);
  const plan = stickerPlan(style, doc).filter((f) => f.stickers.length);
  if (!plan.length) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(stickerPlanText(plan));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is permission-gated; the list is on screen either way.
      setCopied(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...kicker, marginBottom: "5px" }}>Place by hand</div>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.55, color: "var(--muted)" }}>
            The frames render a picture of each sticker. Instagram won&rsquo;t let any scheduler place the real
            tappable one — add these in the app when the story goes up, or the frames collect no taps.
          </p>
        </div>
        <button
          onClick={copy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "7px 13px",
            fontSize: "12.5px",
            fontWeight: 600,
            color: "var(--muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon name={copied ? "check" : "save"} size={13} strokeWidth={2.4} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {plan.map((frame) =>
          frame.stickers.map((s, i) => (
            <div
              key={`${frame.frame}-${s.type}`}
              style={{
                display: "flex",
                gap: "12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "11px 13px",
              }}
            >
              <span
                style={{
                  ...mono(10, { color: "var(--brass)" }),
                  flexShrink: 0,
                  paddingTop: "2px",
                  minWidth: "48px",
                }}
              >
                Frame {frame.frame}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink)" }}>
                  {s.label} sticker
                  {/* A frame declaring two stickers names its primary first. */}
                  {i === 0 && frame.stickers.length > 1 ? (
                    <span style={{ ...mono(9, { color: "var(--muted)", marginLeft: "8px" }) }}>primary</span>
                  ) : null}
                </div>
                {s.values.length ? (
                  <ul style={{ margin: "6px 0 0", padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {s.values.map((v, vi) => (
                      <li
                        key={vi}
                        style={{ fontSize: "13px", color: "var(--ink)", lineHeight: 1.45, wordBreak: "break-word" }}
                      >
                        {v}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "4px" }}>
                    Nothing filled for this sticker yet.
                  </div>
                )}
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px", lineHeight: 1.5 }}>
                  {s.why}
                </div>
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
