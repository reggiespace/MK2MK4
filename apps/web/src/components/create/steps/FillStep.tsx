"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Slide } from "@/components/slide/Slide";
import { SlideFit, SlideScaled } from "@/components/slide/SlideFrame";
import { getManifest, SLIDE_LIMITS } from "@/lib/templates/manifests";
import { canAddSlide, canDeleteSlide, emptySlide, insertIndexFor } from "@/lib/templates/doc";
import type { PostDoc, SlotValue, TemplateStyleId } from "@/lib/templates/types";
import { SlotEditor } from "../SlotEditor";
import { VoiceEditor } from "../VoiceEditor";
import { PostEditor } from "../PostEditor";
import { display } from "../styles";
import type { EditorTab, GenPhase, WizardAccount } from "../types";

/**
 * Step 5 — generate, then fill.
 *
 * Idle shows the summary and the generate button; while the model works the
 * screen paces through writing and composing; when it lands, the two-column
 * fill workspace opens — live preview and thumbnail strip on the left, the
 * three-tab editor on the right.
 */
export function FillStep({
  phase,
  account,
  style,
  arch,
  topic,
  channels,
  doc,
  postId,
  activeSlide,
  editorTab,
  voiceId,
  narration,
  docVersion,
  error,
  onGenerate,
  onRegenerate,
  onSetActiveSlide,
  onSetTab,
  onDocChange,
  onOpenPicker,
  onVoiceId,
  onNarration,
  onToast,
}: {
  phase: GenPhase;
  account: WizardAccount;
  style: TemplateStyleId;
  arch: string;
  topic: string;
  channels: string[];
  doc: PostDoc | null;
  postId: string | null;
  activeSlide: number;
  editorTab: EditorTab;
  voiceId: string;
  narration: "verbatim" | "condensed";
  docVersion: number;
  error: string | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onSetActiveSlide: (i: number) => void;
  onSetTab: (t: EditorTab) => void;
  onDocChange: (next: PostDoc) => void;
  onOpenPicker: (slotId: string) => void;
  onVoiceId: (id: string) => void;
  onNarration: (n: "verbatim" | "condensed") => void;
  onToast: (message: string) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const man = getManifest(style);

  const ctx = {
    style,
    accent: account.accent,
    brand: account.name,
    handle: account.handle,
    initials: account.initials,
    logoUrl: account.logoUrl,
  };

  // ── idle ──────────────────────────────────────────────────────────────────
  if (phase === "idle") {
    const rows: [string, string][] = [
      ["Account", account.name],
      ["Style", man.label],
      ["Template", man.kinds[arch]?.name ?? arch],
      ["Topic", topic || "—"],
      ["Channels", channels.join(" · ") || "none selected"],
    ];

    return (
      <div style={{ animation: "fadeUp .35s ease both", maxWidth: "620px" }}>
        <div style={{ marginBottom: "20px" }}>
          <h2 style={display(22, 700, { margin: "0 0 4px" })}>Ready to generate</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
            AI drafts the copy in your brand voice, then flows it into the template&rsquo;s slots. You&rsquo;ll fill
            and edit everything before it goes out.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "6px 20px",
            marginBottom: "22px",
          }}
        >
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "13px 0",
                borderBottom: i === rows.length - 1 ? "1px solid transparent" : "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  width: "88px",
                  flexShrink: 0,
                }}
              >
                {k}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{v}</span>
            </div>
          ))}
        </div>

        {error ? (
          <div
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger-fg)",
              borderRadius: "10px",
              padding: "11px 14px",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          className="hover-lift"
          onClick={onGenerate}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "9px",
            background: "var(--accent)",
            color: "#f4efe0",
            border: "none",
            borderRadius: "12px",
            padding: "14px 24px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(92,117,86,.28)",
          }}
        >
          <Icon name="sparkles" size={18} strokeWidth={2.2} />
          Generate draft
        </button>
      </div>
    );
  }

  // ── working ───────────────────────────────────────────────────────────────
  if (phase === "writing" || phase === "assets") {
    const writing = phase === "writing";
    return (
      <div style={{ animation: "fadeUp .35s ease both", maxWidth: "640px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              animation: "spin .8s linear infinite",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={display(19, 700, { lineHeight: 1.2 })}>
              {writing ? "Writing your copy…" : "Composing slides…"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>
              {writing ? "In your brand voice, inside every slot's budget." : "Flowing the draft into the template."}
            </div>
          </div>
        </div>

        {writing ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            {[
              ["68%", "44%"],
              ["82%", "56%"],
              ["58%", "72%"],
              ["74%", "38%"],
            ].map(([w1, w2], i) => (
              <div
                key={i}
                style={{
                  animationName: "fadeUp",
                  animationDuration: ".4s",
                  animationTimingFunction: "ease",
                  animationFillMode: "both",
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                {[w1, w2].map((w, j) => (
                  <div
                    key={j}
                    style={{
                      height: "9px",
                      width: w,
                      borderRadius: "5px",
                      background:
                        "linear-gradient(90deg,var(--border) 25%,var(--surface-2) 45%,var(--border) 65%)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.4s linear infinite",
                      marginBottom: j === 0 ? "9px" : 0,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: "118px",
                  aspectRatio: man.aspect === "9:16" ? "9 / 16" : "4 / 5",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "linear-gradient(135deg,var(--surface-2),var(--surface))",
                  overflow: "hidden",
                  position: "relative",
                  animationName: "pop",
                  animationDuration: ".5s",
                  animationTimingFunction: "ease",
                  animationFillMode: "both",
                  animationDelay: `${i * 0.09}s`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(90deg,transparent 25%,rgba(255,255,255,.5) 45%,transparent 65%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.3s linear infinite",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: "9px",
                    left: "9px",
                    right: "9px",
                    height: "3px",
                    borderRadius: "2px",
                    background: "var(--accent)",
                    opacity: 0.5,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── done: the fill workspace ──────────────────────────────────────────────
  if (!doc) return null;

  const slide = doc.slides[activeSlide];
  const total = doc.slides.length;
  const isMulti = !man.single && total > 1;
  const showVoiceTab = man.voice || style === "story";

  function patchDoc(patch: Partial<PostDoc>) {
    onDocChange({ ...doc!, ...patch });
  }

  function setSlot(slotId: string, value: SlotValue) {
    const slides = doc!.slides.map((s, i) => (i === activeSlide ? { ...s, f: { ...s.f, [slotId]: value } } : s));
    onDocChange({ ...doc!, slides });
  }

  function swapArchetype(kind: string) {
    // Swapping the cover keeps the rest of the deck intact.
    const slides = doc!.slides.map((s, i) => (i === activeSlide ? emptySlide(style, kind) : s));
    onDocChange({ ...doc!, slides });
  }

  function addSlide(kind: string) {
    const at = insertIndexFor(style, doc!.slides);
    const slides = [...doc!.slides];
    slides.splice(at, 0, emptySlide(style, kind));
    onDocChange({ ...doc!, slides });
    onSetActiveSlide(at);
    setAddMenuOpen(false);
  }

  function deleteSlide() {
    const slides = doc!.slides.filter((_, i) => i !== activeSlide);
    onDocChange({ ...doc!, slides });
    onSetActiveSlide(Math.max(0, activeSlide - 1));
  }

  function moveSlide(dir: -1 | 1) {
    const target = activeSlide + dir;
    if (target < 0 || target >= total) return;
    const slides = [...doc!.slides];
    [slides[activeSlide], slides[target]] = [slides[target], slides[activeSlide]];
    onDocChange({ ...doc!, slides });
    onSetActiveSlide(target);
  }

  const canControl = canDeleteSlide(style, doc.slides, activeSlide);
  const tabs: { id: EditorTab; label: string }[] = [
    { id: "slides", label: "Slots" },
    ...(showVoiceTab ? [{ id: "voice" as const, label: "Voice" }] : []),
    { id: "post", label: man.noCaption ? "Sticker" : "Post" },
  ];

  return (
    <div style={{ animation: "fadeUp .4s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "var(--ok-bg)",
            color: "var(--ok-fg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={13} strokeWidth={3} />
        </span>
        <h2 style={display(22, 700, { margin: 0 })}>Fill your {man.label}</h2>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--muted)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "4px 10px",
            borderRadius: "999px",
          }}
        >
          {man.kinds[doc.slides[0]?.kind]?.name ?? arch}
        </span>
        <button
          className="hover-slate"
          onClick={onRegenerate}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          <Icon name="refresh" size={14} strokeWidth={2.4} />
          Rewrite text
        </button>
      </div>

      {error ? (
        <div
          style={{
            background: "var(--danger-bg)",
            color: "var(--danger-fg)",
            borderRadius: "10px",
            padding: "11px 14px",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: "24px", alignItems: "start" }}>
        {/* Left — live preview + strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "sticky", top: "14px", minWidth: 0 }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "18px",
              padding: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "470px",
              boxShadow: "inset 0 2px 12px rgba(26,34,48,.05)",
              overflow: "hidden",
            }}
          >
            <div
              className="slide-art"
              style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 18px 44px rgba(26,34,48,.24)", width: "100%" }}
            >
              <SlideFit style={style} maxWidth={man.aspect === "9:16" ? 260 : 360}>
                <Slide slide={slide} index={activeSlide} total={total} ctx={ctx} />
              </SlideFit>
            </div>
          </div>

          {isMulti ? (
            <div>
              <div
                className="thin-scroll"
                style={{ display: "flex", alignItems: "center", gap: "10px", overflowX: "auto", padding: "4px 2px 10px" }}
              >
                {doc.slides.map((s, i) => {
                  const on = i === activeSlide;
                  return (
                    <button
                      key={i}
                      onClick={() => onSetActiveSlide(i)}
                      style={{
                        flexShrink: 0,
                        padding: "5px",
                        borderRadius: "11px",
                        border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                        background: on ? "var(--surface-2)" : "var(--surface)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <div className="slide-art" style={{ borderRadius: "7px", overflow: "hidden", pointerEvents: "none" }}>
                        <SlideScaled style={style} width={style === "reel" || style === "story" ? 48 : 64}>
                          <Slide slide={s} index={i} total={total} ctx={ctx} />
                        </SlideScaled>
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "8.5px",
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          color: on ? "var(--ink)" : "var(--muted)",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </button>
                  );
                })}

                {canAddSlide(style, doc.slides) ? (
                  <button
                    className="hover-accent"
                    onClick={() => setAddMenuOpen((v) => !v)}
                    style={{
                      flexShrink: 0,
                      width: "64px",
                      alignSelf: "stretch",
                      minHeight: "120px",
                      border: "1.5px dashed var(--border-2)",
                      background: "var(--surface)",
                      borderRadius: "11px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="plus" size={15} strokeWidth={2.6} />
                    Add
                  </button>
                ) : null}
              </div>

              {addMenuOpen ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    background: "var(--surface)",
                    border: "1px solid var(--border-2)",
                    borderRadius: "12px",
                    padding: "12px",
                    marginBottom: "10px",
                    animation: "fadeUp .2s ease both",
                  }}
                >
                  <span
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: "2px",
                    }}
                  >
                    Add a slide
                  </span>
                  {man.interior.map((kind) => (
                    <button
                      key={kind}
                      className="hover-accent"
                      onClick={() => addSlide(kind)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "9px",
                        padding: "8px 12px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      {man.kinds[kind].name}
                    </button>
                  ))}
                </div>
              ) : null}

              {canControl ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {man.kinds[slide.kind]?.name}
                  </span>
                  <span style={{ flex: 1 }} />
                  {(
                    [
                      ["chevL", -1 as const, "Move earlier"],
                      ["chevR", 1 as const, "Move later"],
                    ] as const
                  ).map(([icon, dir, title]) => (
                    <button
                      key={icon}
                      title={title}
                      className="hover-slate"
                      onClick={() => moveSlide(dir)}
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
                      }}
                    >
                      <Icon name={icon} size={15} strokeWidth={2.6} />
                    </button>
                  ))}
                  <button
                    title="Delete slide"
                    className="hover-danger"
                    onClick={deleteSlide}
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
                    }}
                  >
                    <Icon name="trash" size={14} strokeWidth={2.3} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  {man.kinds[slide.kind]?.name} · {activeSlide === 0 ? "cover is pinned" : "end card is pinned"} ·{" "}
                  {total}/{SLIDE_LIMITS[style].max}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right — editor tabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              gap: "4px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "11px",
              padding: "4px",
            }}
          >
            {tabs.map((t) => {
              const on = t.id === editorTab;
              return (
                <button
                  key={t.id}
                  onClick={() => onSetTab(t.id)}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: on ? 700 : 600,
                    cursor: "pointer",
                    background: on ? "var(--accent)" : "transparent",
                    color: on ? "#f4efe0" : "var(--muted)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {editorTab === "slides" ? (
            <SlotEditor
              style={style}
              slide={slide}
              isCover={activeSlide === 0}
              onChange={setSlot}
              onSwapArchetype={swapArchetype}
              onOpenPicker={onOpenPicker}
            />
          ) : editorTab === "voice" ? (
            <VoiceEditor
              postId={postId}
              voiceId={voiceId}
              narration={narration}
              docVersion={docVersion}
              onVoiceId={onVoiceId}
              onNarration={onNarration}
              onToast={onToast}
            />
          ) : (
            <PostEditor style={style} doc={doc} onChange={patchDoc} />
          )}
        </div>
      </div>
    </div>
  );
}
