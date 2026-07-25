"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { generateImageAction, listAssetsAction, type LibraryAsset } from "@/app/actions/create";
import type { TemplateStyleId } from "@/lib/templates/types";
import { display, textArea } from "./styles";

/**
 * Fill an image slot: generate with fal.ai (auto-saved to Assets) or pick from
 * the account's library.
 */
export function ImagePicker({
  accountId,
  style,
  initialPrompt,
  onPick,
  onClose,
  onToast,
}: {
  accountId: string;
  style: TemplateStyleId;
  initialPrompt: string;
  onPick: (asset: LibraryAsset) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAssetsAction(accountId).then((res) => {
      if (cancelled) return;
      if (res.ok) setAssets(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function generate() {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    const res = await generateImageAction({ accountId, prompt, style });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onToast("Generated · saved to Assets");
    onPick(res.data);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(20,26,36,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        animation: "fadeIn .18s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px,100%)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          borderRadius: "20px",
          padding: "22px 24px",
          boxShadow: "0 30px 80px rgba(0,0,0,.35)",
          animation: "pop .22s ease both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{ display: "flex", color: "var(--accent)" }}>
            <Icon name="image" size={18} />
          </span>
          <h3 style={display(19, 700, { margin: 0 })}>Fill the image slot</h3>
          <button
            className="hover-slate"
            onClick={onClose}
            style={{
              marginLeft: "auto",
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
            }}
          >
            <Icon name="close" size={15} strokeWidth={2.6} />
          </button>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            padding: "15px 16px",
            marginBottom: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "11px" }}>
            <span style={{ display: "flex", color: "var(--moss)" }}>
              <Icon name="wand" size={14} strokeWidth={2.4} />
            </span>
            <span style={display(15, 700)}>Generate with fal.ai</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--muted)", marginLeft: "auto" }}>
              auto-saves to Assets
            </span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Describe the image — e.g. warm overhead shot of a protein-first plate on linen, soft daylight"
            style={{ ...textArea, marginBottom: "11px", borderRadius: "11px", padding: "11px 13px", fontSize: "13.5px" }}
          />
          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: busy || !prompt.trim() ? "var(--border-2)" : "var(--accent)",
              color: "#f4efe0",
              border: "none",
              borderRadius: "10px",
              padding: "11px 18px",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: busy || !prompt.trim() ? "default" : "pointer",
            }}
          >
            {busy ? (
              <>
                <span
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: "2px solid rgba(244,239,224,.4)",
                    borderTopColor: "#f4efe0",
                    animation: "spin .8s linear infinite",
                  }}
                />
                Generating…
              </>
            ) : (
              <>
                <Icon name="wand" size={14} strokeWidth={2.4} />
                Generate image
              </>
            )}
          </button>
        </div>

        {error ? (
          <div
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger-fg)",
              borderRadius: "10px",
              padding: "10px 13px",
              fontSize: "12.5px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--brass)",
            marginBottom: "11px",
          }}
        >
          From your Assets library
        </div>
        {assets.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px" }}>
            {assets.map((a) => (
              <button
                key={a.id}
                className="hover-accent"
                onClick={() => onPick(a)}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "7px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    aspectRatio: "1/1",
                    borderRadius: "9px",
                    overflow: "hidden",
                    position: "relative",
                    background: `url(${a.url}) center/cover, linear-gradient(150deg,#9c8d6b,#4b4433)`,
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "6px",
                      left: "6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 600,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      background: "rgba(26,34,48,.6)",
                      color: "#f4efe0",
                      padding: "2px 6px",
                      borderRadius: "999px",
                    }}
                  >
                    {a.kind}
                  </span>
                  {a.ai ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        background: "var(--accent)",
                        color: "#f4efe0",
                        padding: "2px 6px",
                        borderRadius: "999px",
                      }}
                    >
                      AI
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginTop: "7px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {a.name}
                </div>
                <div style={{ fontSize: "10.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  {a.meta}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>
            Nothing in the library yet — generate an image above and it will be saved here.
          </p>
        )}
      </div>
    </div>
  );
}
