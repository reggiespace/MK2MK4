"use client";

import { useState } from "react";
import { Icon, PLATFORMS } from "@/components/ui/Icon";
import { display, kicker } from "../styles";
import type { WizardAccount } from "../types";

/**
 * Step 1 — pick the brand account, then confirm which of its channels this
 * post goes to. Channels come from the account's connected platforms; the
 * "Connect channel" row offers the platforms it hasn't connected yet.
 */
export function AccountStep({
  accounts,
  accountId,
  enabledChannels,
  onSelectAccount,
  onToggleChannel,
  onConnectChannel,
}: {
  accounts: WizardAccount[];
  accountId: string;
  enabledChannels: string[];
  onSelectAccount: (id: string) => void;
  onToggleChannel: (platform: string) => void;
  onConnectChannel: (platform: string) => void;
}) {
  const [showConnect, setShowConnect] = useState(false);
  const account = accounts.find((a) => a.id === accountId);
  const connected = account?.channels.map((c) => c.platform) ?? [];
  const addable = Object.keys(PLATFORMS).filter((p) => !connected.includes(p));

  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Choose an account</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          Pick the brand you&rsquo;re creating for, then confirm which channels this post goes to.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        {accounts.map((a) => {
          const selected = a.id === accountId;
          return (
            <button
              key={a.id}
              className="hover-border"
              onClick={() => onSelectAccount(a.id)}
              style={{
                background: "var(--surface)",
                border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "16px",
                padding: "16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                <span
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: a.mark,
                    color: "#f4efe0",
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {a.initials}
                </span>
                <div style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={display(17, 700, { lineHeight: 1.2 })}>{a.name}</div>
                  <div style={{ fontSize: "12.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {a.locale} · {a.channels.length} channels
                  </div>
                </div>
                {selected ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "#f4efe0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "26px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "20px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={kicker}>Channels · {account?.name}</div>
          <button
            className="hover-surface"
            onClick={() => setShowConnect((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "transparent",
              border: "1px dashed var(--border-2)",
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--slate)",
              cursor: "pointer",
            }}
          >
            <Icon name="plus" size={15} strokeWidth={2.6} />
            Connect channel
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {account?.channels.map((ch) => {
            const on = enabledChannels.includes(ch.platform);
            const meta = PLATFORMS[ch.platform];
            return (
              <button
                key={ch.id}
                onClick={() => onToggleChannel(ch.platform)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  background: on ? "var(--surface-2)" : "transparent",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "999px",
                  padding: "9px 14px",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <Icon name={meta?.icon ?? "ig"} size={18} />
                <span style={{ display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.15 }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{meta?.name ?? ch.platform}</span>
                  <span style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {ch.handle}
                  </span>
                </span>
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: on ? "var(--accent)" : "transparent",
                    border: on ? "none" : "1.5px solid var(--border-2)",
                    color: "#f4efe0",
                  }}
                >
                  {on ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
          {!account?.channels.length ? (
            <span style={{ fontSize: "13px", color: "var(--muted)" }}>
              No channels connected yet — add one below.
            </span>
          ) : null}
        </div>

        {showConnect ? (
          <div
            style={{
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border)",
              animation: "fadeUp .25s ease both",
            }}
          >
            <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "10px" }}>
              Connect another platform to {account?.name}:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
              {addable.map((p) => (
                <button
                  key={p}
                  className="hover-slate"
                  onClick={() => {
                    onConnectChannel(p);
                    setShowConnect(false);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", color: "var(--slate)" }}>
                    <Icon name={PLATFORMS[p].icon} size={16} />
                  </span>
                  {PLATFORMS[p].name}
                  <span style={{ color: "var(--moss)", display: "flex" }}>
                    <Icon name="plus" size={13} strokeWidth={2.8} />
                  </span>
                </button>
              ))}
              {!addable.length ? (
                <span style={{ fontSize: "13px", color: "var(--muted)", padding: "9px 4px" }}>
                  All available platforms are connected.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
