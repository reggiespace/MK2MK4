"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon, PLATFORMS } from "@/components/ui/Icon";
import {
  addPillarAction,
  connectIntegrationAction,
  disconnectIntegrationAction,
  removeChannelAction,
  removePillarAction,
  testIntegrationAction,
  updateVoiceAction,
  upsertChannelAction,
} from "@/app/actions/settings";
import { listLogoAssetsAction, setBrandLogoAction } from "@/app/actions/assets";
import { display, kicker, textArea, textInput } from "@/components/create/styles";

/**
 * Settings: publishing and generation credentials, per-account channels,
 * brand voice, and content pillars.
 */

export interface SettingsIntegration {
  provider: string;
  connected: boolean;
  maskedKey?: string;
  baseUrl?: string;
  lastSyncAt?: string;
  usingPlatformKey: boolean;
}

export interface SettingsAccount {
  id: string;
  name: string;
  initials: string;
  mark: string;
  handle: string;
  accent: string;
  /** Currently selected logo asset, or null when the monogram is in use. */
  logoAssetId: string | null;
  logoUrl: string | null;
  voiceDescription: string;
  tones: string[];
  readingLevel: string;
  claimsGuardrail: boolean;
  downloadUrl: string;
  channels: { id: string; platform: string; handle: string; externalId: string | null }[];
  pillars: { id: string; name: string }[];
}

const SECTIONS = [
  { id: "integrations", label: "Integrations", icon: "plug" },
  { id: "channels", label: "Channels", icon: "ig" },
  { id: "voice", label: "Brand voice", icon: "sparkles" },
  { id: "mark", label: "Brand mark", icon: "image" },
  { id: "pillars", label: "Content pillars", icon: "layers" },
] as const;

const PROVIDER_META: Record<string, { name: string; desc: string; group: "publishing" | "generation" }> = {
  postiz: { name: "Postiz", desc: "Open-source scheduler · auto-posts the first comment", group: "publishing" },
  buffer: { name: "Buffer", desc: "Classic queue-based scheduling", group: "publishing" },
  zernio: { name: "Zernio", desc: "Analytics-first publishing API", group: "publishing" },
  openai: { name: "OpenAI", desc: "Writes every caption and slide in your brand voice", group: "generation" },
  fal: { name: "fal.ai", desc: "Image generation for template image slots", group: "generation" },
  elevenlabs: { name: "ElevenLabs", desc: "Narration for Reels and Stories", group: "generation" },
};

const TONES = ["Calm", "Warm", "Evidence-led", "Playful", "Direct", "Editorial"];
const READING = [
  { id: "grade5", label: "Grade 5" },
  { id: "grade7", label: "Grade 7" },
  { id: "grade9", label: "Grade 9" },
];

export function SettingsClient({
  integrations,
  accounts,
  initialAccountId,
}: {
  integrations: SettingsIntegration[];
  accounts: SettingsAccount[];
  initialAccountId: string;
}) {
  const router = useRouter();
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("integrations");
  const [accountId, setAccountId] = useState(initialAccountId);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okText?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNotice(okText ? { kind: "ok", text: okText } : null);
        router.refresh();
      } else {
        setNotice({ kind: "error", text: res.error ?? "Something went wrong." });
      }
    });
  }

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...kicker, marginBottom: "6px" }}>Workspace</div>
          <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1 })}>Settings</h1>
        </div>
        {section !== "integrations" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              padding: "5px 6px",
            }}
          >
            {accounts.map((a) => {
              const on = a.id === accountId;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    border: "none",
                    borderRadius: "999px",
                    padding: "6px 14px 6px 6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: on ? "#f4efe0" : "var(--ink)",
                    background: on ? "var(--ink)" : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "6px",
                      background: a.mark,
                      color: "#f4efe0",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "9.5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {a.initials}
                  </span>
                  {a.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {SECTIONS.map((s) => {
          const on = s.id === section;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                padding: "10px 12px 12px",
                fontSize: "13.5px",
                fontWeight: on ? 700 : 600,
                color: on ? "var(--ink)" : "var(--muted)",
                cursor: "pointer",
                marginBottom: "-1px",
              }}
            >
              <Icon name={s.icon} size={15} strokeWidth={2.2} />
              {s.label}
            </button>
          );
        })}
      </div>

      {notice ? (
        <div
          style={{
            background: notice.kind === "ok" ? "var(--ok-bg)" : "var(--danger-bg)",
            color: notice.kind === "ok" ? "var(--ok-fg)" : "var(--danger-fg)",
            borderRadius: "10px",
            padding: "11px 14px",
            fontSize: "13px",
          }}
        >
          {notice.text}
        </div>
      ) : null}

      {section === "integrations" ? (
        <IntegrationsSection
          integrations={integrations}
          pending={pending}
          run={run}
          notify={(text) => setNotice({ kind: "ok", text })}
        />
      ) : null}
      {section === "channels" && account ? (
        <ChannelsSection account={account} pending={pending} run={run} />
      ) : null}
      {section === "voice" && account ? <VoiceSection account={account} pending={pending} run={run} /> : null}
      {section === "mark" && account ? (
        // Keyed so switching brands remounts and re-seeds the selection.
        <BrandMarkSection key={account.id} account={account} pending={pending} run={run} />
      ) : null}
      {section === "pillars" && account ? <PillarsSection account={account} pending={pending} run={run} /> : null}
    </div>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okText?: string) => void;

function IntegrationsSection({
  integrations,
  pending,
  run,
  notify,
}: {
  integrations: SettingsIntegration[];
  pending: boolean;
  run: Runner;
  notify: (text: string) => void;
}) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");

  const groups: { title: string; blurb: string; group: "publishing" | "generation" }[] = [
    {
      title: "Publishing providers",
      blurb:
        "Connect your own API key so the studio can schedule and publish on your behalf. The first connected provider is the one posts go through.",
      group: "publishing",
    },
    {
      title: "AI generation & voice",
      blurb:
        "Powers the Create flow. These run on ReggieSpace keys by default — connect your own to use your account instead.",
      group: "generation",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {groups.map(({ title, blurb, group }) => (
        <div key={group} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <h2 style={display(20, 700, { margin: "0 0 4px" })}>{title}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>{blurb}</p>
          </div>

          {integrations
            .filter((i) => PROVIDER_META[i.provider]?.group === group)
            .map((i) => {
              const meta = PROVIDER_META[i.provider];
              const isConnecting = connecting === i.provider;
              const own = i.connected && !i.usingPlatformKey;

              return (
                <div
                  key={i.provider}
                  style={{
                    background: "var(--surface)",
                    border: `1.5px solid ${own ? "#bcd6b6" : "var(--border)"}`,
                    borderRadius: "16px",
                    padding: "18px 20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                        <span style={display(17, 700)}>{meta.name}</span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            background: i.connected ? "var(--ok-bg)" : "#e8e2d0",
                            color: i.connected ? "var(--ok-fg)" : "var(--muted)",
                            padding: "3px 9px",
                            borderRadius: "999px",
                          }}
                        >
                          {own ? "Connected" : i.connected ? "Platform key" : "Not connected"}
                        </span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "2px" }}>{meta.desc}</div>
                    </div>

                    {own ? (
                      <button
                        className="hover-slate"
                        disabled={pending}
                        onClick={() => run(() => disconnectIntegrationAction(i.provider), `${meta.name} disconnected`)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "999px",
                          padding: "8px 14px",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        Disconnect
                      </button>
                    ) : null}

                    {!isConnecting ? (
                      <button
                        className="hover-surface"
                        onClick={() => {
                          setConnecting(i.provider);
                          setKeyDraft("");
                          setUrlDraft(i.baseUrl ?? "");
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "7px",
                          background: "var(--surface)",
                          border: "1px solid var(--border-2)",
                          borderRadius: "999px",
                          padding: "9px 16px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--slate)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="plug" size={15} />
                        {own ? "Replace key" : "Connect"}
                      </button>
                    ) : null}
                  </div>

                  {own ? (
                    <div
                      style={{
                        marginTop: "14px",
                        paddingTop: "14px",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "20px",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ ...kicker, fontSize: "10px", marginBottom: "4px" }}>API key</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>{i.maskedKey}</div>
                      </div>
                      {i.lastSyncAt ? (
                        <div>
                          <div style={{ ...kicker, fontSize: "10px", marginBottom: "4px" }}>Last synced</div>
                          <div style={{ fontSize: "13px" }}>{new Date(i.lastSyncAt).toLocaleString()}</div>
                        </div>
                      ) : null}
                      <button
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const res = await testIntegrationAction(i.provider);
                            if (res.ok) notify(res.data.message);
                            return res;
                          })
                        }
                        style={{
                          marginLeft: "auto",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "transparent",
                          border: "none",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "var(--slate)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="refresh" size={14} />
                        Test connection
                      </button>
                    </div>
                  ) : null}

                  {isConnecting ? (
                    <div
                      style={{
                        marginTop: "14px",
                        paddingTop: "14px",
                        borderTop: "1px solid var(--border)",
                        animation: "fadeUp .2s ease both",
                      }}
                    >
                      <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: "9px" }}>
                        Paste your {meta.name} API key. It is encrypted before it is stored.
                      </div>
                      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>
                        <input
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          placeholder="API key"
                          style={{ ...textInput, flex: 1, minWidth: "220px", fontFamily: "var(--font-mono)" }}
                        />
                        {group === "publishing" ? (
                          <input
                            value={urlDraft}
                            onChange={(e) => setUrlDraft(e.target.value)}
                            placeholder="Base URL (self-hosted)"
                            style={{ ...textInput, flex: 1, minWidth: "220px", fontFamily: "var(--font-mono)" }}
                          />
                        ) : null}
                        <button
                          className="hover-lift"
                          disabled={pending || !keyDraft.trim()}
                          onClick={() =>
                            run(async () => {
                              const res = await connectIntegrationAction({
                                provider: i.provider,
                                apiKey: keyDraft,
                                baseUrl: urlDraft,
                              });
                              if (res.ok) setConnecting(null);
                              return res;
                            }, `${meta.name} connected`)
                          }
                          style={{
                            background: keyDraft.trim() ? "var(--accent)" : "var(--border-2)",
                            color: "#f4efe0",
                            border: "none",
                            borderRadius: "10px",
                            padding: "11px 20px",
                            fontSize: "13.5px",
                            fontWeight: 700,
                            cursor: keyDraft.trim() ? "pointer" : "default",
                          }}
                        >
                          Save &amp; connect
                        </button>
                        <button
                          onClick={() => setConnecting(null)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "10px",
                            padding: "11px 16px",
                            fontSize: "13.5px",
                            fontWeight: 600,
                            color: "var(--muted)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

function ChannelsSection({ account, pending, run }: { account: SettingsAccount; pending: boolean; run: Runner }) {
  const [draft, setDraft] = useState<{ platform: string; handle: string; externalId: string } | null>(null);
  const connected = account.channels.map((c) => c.platform);
  const addable = Object.keys(PLATFORMS).filter((p) => !connected.includes(p));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h2 style={display(20, 700, { margin: "0 0 4px" })}>Channels · {account.name}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          Each channel needs its publisher-side id (in Postiz, the integration id) before it can publish.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "12px" }}>
        {account.channels.map((ch) => (
          <div
            key={ch.id}
            style={{
              background: "var(--surface)",
              border: `1px solid ${ch.externalId ? "var(--border)" : "#e0c9a0"}`,
              borderRadius: "14px",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: "13px",
            }}
          >
            <span
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--slate)",
                flexShrink: 0,
              }}
            >
              <Icon name={PLATFORMS[ch.platform]?.icon ?? "ig"} size={19} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 600 }}>{PLATFORMS[ch.platform]?.name ?? ch.platform}</div>
              <div
                style={{
                  fontSize: "12px",
                  color: ch.externalId ? "var(--muted)" : "var(--warn-fg)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {ch.externalId ? `${ch.handle} · ${ch.externalId.slice(0, 12)}…` : "no channel id — can't publish"}
              </div>
            </div>
            <button
              onClick={() => setDraft({ platform: ch.platform, handle: ch.handle, externalId: ch.externalId ?? "" })}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--slate)",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              className="hover-danger"
              disabled={pending}
              onClick={() => run(() => removeChannelAction(account.id, ch.id), "Channel removed")}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>

      {draft ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: "14px",
            padding: "16px 18px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 700, textTransform: "capitalize" }}>{draft.platform}</span>
          <input
            value={draft.handle}
            onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
            placeholder="@handle"
            style={{ ...textInput, flex: 1, minWidth: "160px" }}
          />
          <input
            value={draft.externalId}
            onChange={(e) => setDraft({ ...draft, externalId: e.target.value })}
            placeholder="Publisher channel id"
            style={{ ...textInput, flex: 1.4, minWidth: "200px", fontFamily: "var(--font-mono)" }}
          />
          <button
            className="hover-lift"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await upsertChannelAction({ accountId: account.id, ...draft });
                if (res.ok) setDraft(null);
                return res;
              }, "Channel saved")
            }
            style={{
              background: "var(--accent)",
              color: "#f4efe0",
              border: "none",
              borderRadius: "10px",
              padding: "11px 18px",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            onClick={() => setDraft(null)}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "11px 16px",
              fontSize: "13.5px",
              fontWeight: 600,
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {addable.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
          {addable.map((p) => (
            <button
              key={p}
              className="hover-slate"
              onClick={() => setDraft({ platform: p, handle: account.handle, externalId: "" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--surface-2)",
                border: "1px dashed var(--border-2)",
                borderRadius: "999px",
                padding: "9px 15px",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--ink)",
                cursor: "pointer",
              }}
            >
              <Icon name={PLATFORMS[p].icon} size={16} />
              {PLATFORMS[p].name}
              <Icon name="plus" size={14} strokeWidth={2.4} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VoiceSection({ account, pending, run }: { account: SettingsAccount; pending: boolean; run: Runner }) {
  const [voice, setVoice] = useState(account.voiceDescription);
  const [tones, setTones] = useState(account.tones);
  const [reading, setReading] = useState(account.readingLevel);
  const [guardrail, setGuardrail] = useState(account.claimsGuardrail);
  const [downloadUrl, setDownloadUrl] = useState(account.downloadUrl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "720px" }}>
      <div>
        <h2 style={display(20, 700, { margin: "0 0 4px" })}>Brand voice · {account.name}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          The AI writes every caption and slide in this voice. Edits apply to all future generations.
        </p>
      </div>

      <div>
        <div style={{ ...kicker, marginBottom: "10px" }}>Voice description</div>
        <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={6} style={textArea} />
      </div>

      <div>
        <div style={{ ...kicker, marginBottom: "10px" }}>Tone</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TONES.map((t) => {
            const on = tones.includes(t);
            return (
              <button
                key={t}
                onClick={() => setTones(on ? tones.filter((x) => x !== t) : [...tones, t])}
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
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ ...kicker, marginBottom: "10px" }}>Reading level</div>
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
          {READING.map((r) => {
            const on = reading === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setReading(r.id)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#f4efe0" : "var(--muted)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ ...kicker, marginBottom: "10px" }}>Download link</div>
        <input
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          placeholder="https://…"
          style={{ ...textInput, fontFamily: "var(--font-mono)" }}
        />
        <p style={{ margin: "7px 0 0", fontSize: "12px", color: "var(--muted)" }}>
          Used in the caption and first comment. Never placed on a slide.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "16px 18px",
        }}
      >
        <span style={{ display: "flex", color: "var(--moss)", marginTop: "1px" }}>
          <Icon name="shield" size={22} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14.5px", fontWeight: 700 }}>Medical-claims guardrail</div>
          <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "2px", lineHeight: 1.5 }}>
            Instructs every generation to avoid unproven health claims and to frame physiological figures as model
            estimates rather than measurements.
          </div>
        </div>
        <button
          onClick={() => setGuardrail((g) => !g)}
          aria-pressed={guardrail}
          style={{
            width: "46px",
            height: "26px",
            borderRadius: "999px",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
            position: "relative",
            background: guardrail ? "var(--accent)" : "#cabf9d",
            transition: "background .15s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "3px",
              left: guardrail ? "23px" : "3px",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#f4efe0",
              transition: "left .15s",
              boxShadow: "0 1px 3px rgba(0,0,0,.2)",
            }}
          />
        </button>
      </div>

      <button
        className="hover-lift"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              updateVoiceAction({
                accountId: account.id,
                voiceDescription: voice,
                tones,
                readingLevel: reading,
                claimsGuardrail: guardrail,
                downloadUrl,
              }),
            "Brand voice saved",
          )
        }
        style={{
          alignSelf: "flex-start",
          background: "var(--accent)",
          color: "#f4efe0",
          border: "none",
          borderRadius: "11px",
          padding: "12px 22px",
          fontSize: "14px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {pending ? "Saving…" : "Save brand voice"}
      </button>
    </div>
  );
}

/**
 * Brand mark picker.
 *
 * The renderer draws this wherever the initials monogram used to sit — the reel
 * and story chips and the photo chip — so choosing one here changes every future
 * export without touching a template. Candidates come from the Assets library
 * filed under Logo; uploading happens on the Assets page rather than here, so
 * there is one ingest path instead of two.
 */
function BrandMarkSection({ account, pending, run }: { account: SettingsAccount; pending: boolean; run: Runner }) {
  const [options, setOptions] = useState<{ id: string; name: string; url: string }[] | null>(null);
  const [selected, setSelected] = useState<string | null>(account.logoAssetId);
  const [loading, startLoad] = useTransition();

  // Load once per account rather than on every settings visit — the list is only
  // needed when this tab is open, and it changes only when someone uploads. The
  // caller keys this component on the account id, so switching brands remounts
  // and re-seeds `selected` instead of needing a reset here.
  useEffect(() => {
    startLoad(async () => {
      const res = await listLogoAssetsAction(account.id);
      setOptions(res.ok ? res.data : []);
    });
  }, [account.id]);

  const preview = options?.find((o) => o.id === selected)?.url ?? (selected ? account.logoUrl : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "720px" }}>
      <div>
        <h2 style={display(20, 700, { margin: "0 0 4px" })}>Brand mark · {account.name}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          Drawn in the corner chip on Reels, Stories and photo posts. With no mark set, slides fall back to the{" "}
          <strong>{account.initials}</strong> monogram.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "18px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: preview
              ? `url(${preview}) center/contain no-repeat, ${account.accent}`
              : account.accent,
            color: "#f4efe0",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "26px",
          }}
        >
          {preview ? "" : account.initials}
        </span>
        <div style={{ fontSize: "13.5px", color: "var(--muted)", lineHeight: 1.6 }}>
          {preview
            ? "This mark is drawn on every slide the chip appears on."
            : "No mark set — slides use the monogram."}
          <br />
          The logo is fit inside the chip, never cropped, over the brand accent.
        </div>
      </div>

      <div>
        <div style={{ ...kicker, marginBottom: "10px" }}>Choose from the library</div>
        {loading && options === null ? (
          <div style={{ fontSize: "13px", color: "var(--muted)" }}>Loading…</div>
        ) : options && options.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(104px,1fr))", gap: "10px" }}>
            {options.map((o) => {
              const on = o.id === selected;
              return (
                <button
                  key={o.id}
                  onClick={() => setSelected(on ? null : o.id)}
                  title={o.name}
                  style={{
                    border: `2px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "14px",
                    background: "var(--surface)",
                    padding: "8px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "7px",
                  }}
                >
                  <span
                    style={{
                      aspectRatio: "1/1",
                      borderRadius: "9px",
                      background: `url(${o.url}) center/contain no-repeat, var(--surface-2)`,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {o.name}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              border: "1px dashed var(--border-2)",
              borderRadius: "14px",
              padding: "22px",
              fontSize: "13.5px",
              color: "var(--muted)",
            }}
          >
            No logos in the library yet. Upload one on the{" "}
            <a href="/assets" style={{ color: "var(--slate)", fontWeight: 600 }}>
              Assets
            </a>{" "}
            page — file it as <strong>Logo</strong> and it will appear here.
          </div>
        )}
      </div>

      <button
        className="hover-lift"
        disabled={pending || selected === account.logoAssetId}
        onClick={() =>
          run(
            () => setBrandLogoAction(account.id, selected),
            selected ? "Brand mark saved" : "Brand mark cleared — back to the monogram",
          )
        }
        style={{
          alignSelf: "flex-start",
          background: selected === account.logoAssetId ? "var(--border)" : "var(--accent)",
          color: selected === account.logoAssetId ? "var(--muted)" : "#f4efe0",
          border: "none",
          borderRadius: "11px",
          padding: "12px 22px",
          fontSize: "14px",
          fontWeight: 700,
          cursor: selected === account.logoAssetId ? "default" : "pointer",
        }}
      >
        {pending ? "Saving…" : "Save brand mark"}
      </button>
    </div>
  );
}

function PillarsSection({ account, pending, run }: { account: SettingsAccount; pending: boolean; run: Runner }) {
  const [draft, setDraft] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "640px" }}>
      <div>
        <h2 style={display(20, 700, { margin: "0 0 4px" })}>Content pillars · {account.name}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
          The recurring themes AI draws from when suggesting topics. Keep 4–6 for a focused feed.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {account.pillars.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "12px 14px 12px 16px",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: "14.5px", fontWeight: 500 }}>{p.name}</span>
            <button
              className="hover-danger"
              disabled={pending}
              onClick={() => run(() => removePillarAction(account.id, p.id), "Pillar removed")}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "7px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Icon name="close" size={14} strokeWidth={2.6} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              run(async () => {
                const res = await addPillarAction(account.id, draft);
                if (res.ok) setDraft("");
                return res;
              }, "Pillar added");
            }
          }}
          placeholder="Add a content pillar…"
          style={{ ...textInput, flex: 1, minWidth: "220px", padding: "11px 15px", fontSize: "14px" }}
        />
        <button
          className="hover-lift"
          disabled={pending || !draft.trim()}
          onClick={() =>
            run(async () => {
              const res = await addPillarAction(account.id, draft);
              if (res.ok) setDraft("");
              return res;
            }, "Pillar added")
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            background: draft.trim() ? "var(--accent)" : "var(--border-2)",
            color: "#f4efe0",
            border: "none",
            borderRadius: "11px",
            padding: "11px 18px",
            fontSize: "13.5px",
            fontWeight: 700,
            cursor: draft.trim() ? "pointer" : "default",
          }}
        >
          <Icon name="plus" size={14} strokeWidth={2.8} />
          Add pillar
        </button>
      </div>
    </div>
  );
}
