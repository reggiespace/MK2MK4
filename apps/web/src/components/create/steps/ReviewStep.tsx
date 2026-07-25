"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, PLATFORMS } from "@/components/ui/Icon";
import { Slide } from "@/components/slide/Slide";
import { SlideFit } from "@/components/slide/SlideFrame";
import { checkDraftAction, type ReviewCheck } from "@/app/actions/create";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { display, kicker, textInput } from "../styles";
import type { WizardAccount } from "../types";

/**
 * Step 6 — the post exactly as it will appear, beside the publish panel.
 * The cover is drawn by the same renderer that filled it, so nothing shifts
 * between approval and publication.
 */
export function ReviewStep({
  account,
  style,
  doc,
  postId,
  channels,
  when,
  customTime,
  scheduled,
  scheduling,
  scheduledMessage,
  error,
  onWhen,
  onCustomTime,
  onSchedule,
  onReset,
}: {
  account: WizardAccount;
  style: TemplateStyleId;
  doc: PostDoc;
  postId: string | null;
  channels: string[];
  when: "best" | "custom";
  customTime: string;
  scheduled: boolean;
  scheduling: boolean;
  scheduledMessage: string;
  error: string | null;
  onWhen: (w: "best" | "custom") => void;
  onCustomTime: (v: string) => void;
  onSchedule: (mode: "schedule" | "now") => void;
  onReset: () => void;
}) {
  const [check, setCheck] = useState<ReviewCheck | null>(null);
  const man = getManifest(style);

  useEffect(() => {
    if (!postId || scheduled) return;
    let cancelled = false;
    checkDraftAction(postId).then((res) => {
      if (!cancelled && res.ok) setCheck(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [postId, scheduled]);

  const ctx = {
    style,
    accent: account.accent,
    brand: account.name,
    handle: account.handle,
    initials: account.initials,
  };

  if (scheduled) {
    return (
      <div style={{ maxWidth: "520px", margin: "24px auto", textAlign: "center", animation: "pop .5s ease both" }}>
        <span
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "var(--ok-bg)",
            color: "var(--ok-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "18px",
          }}
        >
          <Icon name="check" size={30} strokeWidth={3} />
        </span>
        <h2 style={display(26, 700, { margin: "0 0 8px" })}>Scheduled</h2>
        <p style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: "14.5px", lineHeight: 1.6 }}>
          {scheduledMessage}
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            className="hover-lift"
            onClick={onReset}
            style={{
              background: "var(--accent)",
              color: "#f4efe0",
              border: "none",
              borderRadius: "11px",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create another
          </button>
          <Link
            href="/pieces"
            style={{
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--border)",
              borderRadius: "11px",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            View pieces
          </Link>
        </div>
      </div>
    );
  }

  const cleared = check?.cleared ?? false;
  const captionShort = doc.caption.split("\n")[0];

  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Review &amp; publish</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          This is exactly how the post appears live. Approve to schedule it.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,392px) 1fr", gap: "28px", alignItems: "start" }}>
        {/* Instagram-style preview card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(26,34,48,.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px" }}>
            <span
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: account.mark,
                color: "#f4efe0",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {account.initials}
            </span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>{account.handle}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{man.label}</div>
            </div>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700, letterSpacing: "1px" }}>···</span>
          </div>

          <div
            className="slide-art"
            style={{ position: "relative", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <SlideFit style={style} maxWidth={392}>
              <Slide slide={doc.slides[0]} index={0} total={doc.slides.length} ctx={ctx} />
            </SlideFit>
            {doc.slides.length > 1 ? (
              <span
                style={{
                  position: "absolute",
                  bottom: "12px",
                  right: "12px",
                  zIndex: 2,
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  background: "rgba(0,0,0,.4)",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: "999px",
                }}
              >
                1/{doc.slides.length}
              </span>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 14px 6px", color: "var(--ink)" }}>
            <Icon name="heart" size={22} />
            <Icon name="comment" size={22} />
            <Icon name="send" size={22} />
            <span style={{ marginLeft: "auto", display: "flex" }}>
              <Icon name="save" size={22} />
            </span>
          </div>

          <div style={{ padding: "2px 14px 16px" }}>
            {man.noCaption ? (
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "var(--muted)" }}>
                Story · {doc.slides.length} frames · tap-through with an interactive sticker on each.
              </p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                  <span style={{ fontWeight: 700 }}>{account.handle}</span> {captionShort}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                  {doc.hashtags.map((h) => (
                    <span key={h} style={{ fontSize: "12.5px", color: "var(--slate)" }}>
                      {h}
                    </span>
                  ))}
                </div>
                {doc.first ? (
                  <p style={{ margin: "9px 0 0", fontSize: "13px", lineHeight: 1.5, color: "var(--ink)" }}>
                    <span style={{ fontWeight: 700 }}>{account.handle}</span> {doc.first.split("\n")[0]}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Publish panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "flex-start",
              gap: "8px",
              background: cleared ? "var(--ok-bg)" : "var(--warn-bg)",
              color: cleared ? "var(--ok-fg)" : "var(--warn-fg)",
              borderRadius: "10px",
              padding: "9px 13px",
              fontSize: "13px",
              fontWeight: 600,
              alignSelf: "flex-start",
              maxWidth: "100%",
            }}
          >
            <span style={{ display: "flex", marginTop: "1px" }}>
              <Icon name={cleared ? "check" : "info"} size={14} strokeWidth={2.8} />
            </span>
            <span>
              {check === null
                ? "Checking the draft…"
                : cleared
                  ? "Cleared to publish · every required slot is filled"
                  : `${check.issues.length} thing${check.issues.length === 1 ? "" : "s"} still to fix`}
              {check && !cleared ? (
                <span style={{ display: "block", fontWeight: 400, marginTop: "5px", lineHeight: 1.5 }}>
                  {check.issues.slice(0, 4).join(" · ")}
                </span>
              ) : null}
            </span>
          </div>

          <div>
            <div style={{ ...kicker, marginBottom: "10px" }}>Publishing to</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
              {channels.map((p) => (
                <span
                  key={p}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  <span style={{ display: "flex", color: "var(--slate)" }}>
                    <Icon name={PLATFORMS[p]?.icon ?? "ig"} size={16} />
                  </span>
                  {PLATFORMS[p]?.name ?? p}
                </span>
              ))}
              {!channels.length ? (
                <span style={{ fontSize: "13px", color: "var(--danger-fg)" }}>
                  No channels selected — go back to step 1.
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <div style={{ ...kicker, marginBottom: "10px" }}>When</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {(
                [
                  ["best", "sparkles", "Best time", "Next recommended slot for this account"],
                  ["custom", "clock", "Custom time", "Choose your own slot"],
                ] as const
              ).map(([id, icon, title, sub]) => {
                const on = when === id;
                return (
                  <button
                    key={id}
                    onClick={() => onWhen(id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                      background: "var(--surface)",
                      border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "12px",
                      padding: "12px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ display: "flex", color: on ? "var(--moss)" : "var(--muted)" }}>
                      <Icon name={icon} size={16} strokeWidth={2.2} />
                    </span>
                    <span style={{ textAlign: "left", flex: 1 }}>
                      <span style={{ display: "block", fontSize: "13.5px", fontWeight: 600 }}>{title}</span>
                      <span style={{ display: "block", fontSize: "11.5px", color: "var(--muted)" }}>{sub}</span>
                    </span>
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: on ? "none" : "1.5px solid var(--border-2)",
                        background: on ? "var(--accent)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#f4efe0",
                      }}
                    >
                      {on ? <Icon name="check" size={11} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {when === "custom" ? (
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => onCustomTime(e.target.value)}
                style={{ ...textInput, marginTop: "9px" }}
              />
            ) : null}
          </div>

          {error ? (
            <div
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger-fg)",
                borderRadius: "10px",
                padding: "11px 14px",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "2px" }}>
            <button
              className="hover-lift"
              disabled={scheduling || !channels.length}
              onClick={() => onSchedule("schedule")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "9px",
                background: scheduling || !channels.length ? "var(--border-2)" : "var(--accent)",
                color: "#f4efe0",
                border: "none",
                borderRadius: "12px",
                padding: "15px 22px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: scheduling || !channels.length ? "default" : "pointer",
                boxShadow: "0 6px 18px rgba(92,117,86,.28)",
              }}
            >
              {scheduling ? "Working…" : <Icon name="check" size={18} strokeWidth={2.8} />}
              {scheduling ? "" : "Approve & schedule"}
            </button>
            <button
              className="hover-surface"
              disabled={scheduling || !channels.length}
              onClick={() => onSchedule("now")}
              style={{
                background: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--border-2)",
                borderRadius: "12px",
                padding: "13px 22px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: scheduling || !channels.length ? "default" : "pointer",
              }}
            >
              Publish now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
