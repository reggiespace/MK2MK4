"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Stepper, STEP_LABELS } from "./Stepper";
import { AccountStep } from "./steps/AccountStep";
import { StyleStep } from "./steps/StyleStep";
import { TemplateStep } from "./steps/TemplateStep";
import { TopicStep } from "./steps/TopicStep";
import { FillStep } from "./steps/FillStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ImagePicker } from "./ImagePicker";
import { DEFAULT_VOICE_ID } from "@/lib/ai/voices";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { suggestImagePrompt } from "@/lib/templates/image-prompt";
import {
  generateDraftAction,
  saveDraftAction,
  suggestTopicsAction,
  type LibraryAsset,
} from "@/app/actions/create";
import { publishPostAction } from "@/app/actions/publish";
import { display } from "./styles";
import type { EditorTab, GenPhase, InitialDraft, WizardAccount } from "./types";
import type { SuggestedIdea } from "@/lib/ai/ideas";

/**
 * The Create wizard: Account → Style → Template → Topic → Create → Review.
 *
 * Holds the draft document; every edit mutates `doc`, which is debounced back
 * to the server so a refresh never loses work.
 */
export function StudioWizard({
  accounts,
  initialAccountId,
  publisherName,
  initialDraft,
}: {
  accounts: WizardAccount[];
  initialAccountId: string;
  publisherName: string;
  initialDraft?: InitialDraft;
}) {
  const [step, setStep] = useState(initialDraft ? 4 : 0);
  const [maxStep, setMaxStep] = useState(initialDraft ? 5 : 0);
  const [accountId, setAccountId] = useState(initialDraft?.accountId ?? initialAccountId);
  const [channels, setChannels] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.channels.map((c) => c.platform)])),
  );
  const [style, setStyle] = useState<TemplateStyleId | null>(initialDraft?.style ?? null);
  const [arch, setArch] = useState<string | null>(initialDraft?.archetype ?? null);
  const [topic, setTopic] = useState(initialDraft?.topic ?? "");
  const [pillar, setPillar] = useState<string | null>(initialDraft?.pillar ?? null);
  const [ideas, setIdeas] = useState<SuggestedIdea[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [genPhase, setGenPhase] = useState<GenPhase>(initialDraft ? "done" : "idle");
  const [postId, setPostId] = useState<string | null>(initialDraft?.postId ?? null);
  const [doc, setDoc] = useState<PostDoc | null>(initialDraft?.doc ?? null);
  const [docVersion, setDocVersion] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("slides");
  const [voiceId, setVoiceId] = useState<string>(initialDraft?.voiceId ?? DEFAULT_VOICE_ID);
  const [narration, setNarration] = useState<"verbatim" | "condensed">(initialDraft?.narration ?? "verbatim");
  const [when, setWhen] = useState<"best" | "custom">("best");
  const [customTime, setCustomTime] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduledMessage, setScheduledMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const activeChannels = channels[accountId] ?? [];

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  // Debounced autosave — the wizard is long, edits shouldn't be lost on refresh.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!postId || !doc) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraftAction(postId, doc);
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [postId, doc]);

  function updateDoc(next: PostDoc) {
    setDoc(next);
    setDocVersion((v) => v + 1);
  }

  function go(n: number) {
    if (n <= maxStep) setStep(n);
  }
  function next() {
    const n = Math.min(step + 1, 5);
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function selectStyle(id: TemplateStyleId) {
    setStyle(id);
    setArch(getManifest(id).cover[0]);
  }

  async function suggestTopics() {
    setSuggesting(true);
    setError(null);
    const res = await suggestTopicsAction(accountId, pillar);
    setSuggesting(false);
    if (res.ok) setIdeas(res.data);
    else setError(res.error);
  }

  async function generate(regenerate = false) {
    if (!style || !arch) return;
    setError(null);
    setGenPhase("writing");

    // The two working phases are cosmetic pacing over one round trip; flip to
    // "assets" partway so the screen reflects the second half of the work.
    const toAssets = setTimeout(() => setGenPhase("assets"), 2200);

    const res = await generateDraftAction({
      accountId,
      style,
      archetype: arch,
      topic,
      pillar,
      postId: regenerate ? postId ?? undefined : undefined,
    });
    clearTimeout(toAssets);

    if (!res.ok) {
      setGenPhase("idle");
      setError(res.error);
      return;
    }
    setPostId(res.data.postId);
    updateDoc(res.data.doc);
    setActiveSlide(0);
    setEditorTab("slides");
    setGenPhase("done");
  }

  async function schedule(mode: "schedule" | "now") {
    if (!postId) return;
    setScheduling(true);
    setError(null);
    const res = await publishPostAction({
      postId,
      platforms: activeChannels,
      mode,
      at: when === "custom" && customTime ? new Date(customTime).toISOString() : null,
    });
    setScheduling(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const at = new Date(res.data.scheduledAt);
    setScheduledMessage(
      mode === "now"
        ? `Published to ${res.data.channels.join(" and ")} via ${publisherName}.`
        : `Queued for ${at.toLocaleString()} on ${res.data.channels.join(" and ")} via ${publisherName}.`,
    );
    setScheduled(true);
  }

  function reset() {
    setStep(0);
    setMaxStep(0);
    setStyle(null);
    setArch(null);
    setTopic("");
    setPillar(null);
    setIdeas(null);
    setGenPhase("idle");
    setPostId(null);
    setDoc(null);
    setActiveSlide(0);
    setEditorTab("slides");
    setScheduled(false);
    setScheduledMessage("");
    setWhen("best");
    setCustomTime("");
    setError(null);
  }

  function applyPickedAsset(asset: LibraryAsset) {
    if (!doc || !pickerSlot) return;
    const slides = doc.slides.map((s, i) =>
      i === activeSlide
        ? { ...s, f: { ...s.f, [pickerSlot]: { id: asset.id, name: asset.name, url: asset.url, ai: asset.ai } } }
        : s,
    );
    updateDoc({ ...doc, slides });
    setPickerSlot(null);
  }

  // Gate Continue on the step's own requirement.
  const canContinue =
    step === 0
      ? activeChannels.length > 0
      : step === 1
        ? Boolean(style)
        : step === 2
          ? Boolean(arch)
          : step === 3
            ? topic.trim().length > 0
            : step === 4
              ? genPhase === "done"
              : false;

  const showFooter = !(step === 5 && scheduled);
  const showContinue = step < 5;

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "32px 40px 56px", display: "flex", flexDirection: "column", gap: "26px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "var(--brass)",
              marginBottom: "6px",
            }}
          >
            New post
          </div>
          <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1, color: "var(--ink)" })}>Create content</h1>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "6px 8px 6px 14px",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>Publishing via</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--ink)",
              color: "var(--surface)",
              borderRadius: "999px",
              padding: "5px 11px",
              fontSize: "12px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              letterSpacing: ".04em",
            }}
          >
            <Icon name="link" size={13} strokeWidth={2.4} />
            {publisherName}
          </span>
        </div>
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "28px 30px",
          boxShadow: "0 1px 0 rgba(255,255,255,.6) inset",
        }}
      >
        <Stepper step={step} maxStep={maxStep} onGo={go} />

        <div style={{ minWidth: 0 }}>
          {step === 0 ? (
            <AccountStep
              accounts={accounts}
              accountId={accountId}
              enabledChannels={activeChannels}
              onSelectAccount={(id) => {
                setAccountId(id);
                setIdeas(null);
                setPillar(null);
              }}
              onToggleChannel={(platform) =>
                setChannels((c) => ({
                  ...c,
                  [accountId]: (c[accountId] ?? []).includes(platform)
                    ? (c[accountId] ?? []).filter((p) => p !== platform)
                    : [...(c[accountId] ?? []), platform],
                }))
              }
              onConnectChannel={() =>
                showToast("Connect new platforms in Settings → Channels, then reload.")
              }
            />
          ) : null}

          {step === 1 ? <StyleStep style={style} onSelect={selectStyle} /> : null}

          {step === 2 && style ? (
            <TemplateStep style={style} arch={arch} account={account} onSelect={setArch} />
          ) : null}

          {step === 3 ? (
            <TopicStep
              pillars={account.pillars}
              pillar={pillar}
              topic={topic}
              ideas={ideas}
              suggesting={suggesting}
              onPickPillar={(name) => {
                setPillar(name === pillar ? null : name);
                if (!topic.trim()) setTopic(name);
              }}
              onTopicChange={setTopic}
              onSuggest={suggestTopics}
              onPickIdea={(idea) => setTopic(idea.title)}
            />
          ) : null}

          {step === 4 && style && arch ? (
            <FillStep
              phase={genPhase}
              account={account}
              style={style}
              arch={arch}
              topic={topic}
              channels={activeChannels}
              doc={doc}
              postId={postId}
              activeSlide={activeSlide}
              editorTab={editorTab}
              voiceId={voiceId}
              narration={narration}
              docVersion={docVersion}
              error={error}
              onGenerate={() => void generate(false)}
              onRegenerate={() => void generate(true)}
              onSetActiveSlide={setActiveSlide}
              onSetTab={setEditorTab}
              onDocChange={updateDoc}
              onOpenPicker={setPickerSlot}
              onVoiceId={setVoiceId}
              onNarration={setNarration}
              onToast={showToast}
            />
          ) : null}

          {step === 5 && style && doc ? (
            <ReviewStep
              account={account}
              style={style}
              doc={doc}
              postId={postId}
              channels={activeChannels}
              when={when}
              customTime={customTime}
              scheduled={scheduled}
              scheduling={scheduling}
              scheduledMessage={scheduledMessage}
              error={error}
              onWhen={setWhen}
              onCustomTime={setCustomTime}
              onSchedule={schedule}
              onReset={reset}
            />
          ) : null}

          {showFooter ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                marginTop: "34px",
                paddingTop: "20px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={back}
                disabled={step === 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "11px",
                  padding: "11px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--muted)",
                  cursor: step === 0 ? "default" : "pointer",
                  opacity: step === 0 ? 0.45 : 1,
                }}
              >
                <Icon name="chevL" size={16} strokeWidth={2.6} />
                Back
              </button>

              <span
                style={{
                  fontSize: "12.5px",
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: ".04em",
                }}
              >
                Step {step + 1} of 6 · {STEP_LABELS[step]}
              </span>

              {showContinue ? (
                <button
                  className="hover-lift"
                  onClick={next}
                  disabled={!canContinue}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: canContinue ? "var(--accent)" : "var(--border-2)",
                    color: "#f4efe0",
                    border: "none",
                    borderRadius: "11px",
                    padding: "12px 20px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: canContinue ? "pointer" : "default",
                  }}
                >
                  {step === 4 ? "Review" : "Continue"}
                  <Icon name="arrowR" size={16} strokeWidth={2.4} />
                </button>
              ) : (
                <span style={{ width: "120px" }} />
              )}
            </div>
          ) : null}
        </div>
      </div>

      {pickerSlot && style ? (
        <ImagePicker
          accountId={accountId}
          style={style}
          initialPrompt={suggestImagePrompt({
            style,
            slide: doc?.slides[activeSlide],
            topic,
            brand: account?.name,
          })}
          onPick={applyPickedAsset}
          onClose={() => setPickerSlot(null)}
          onToast={showToast}
        />
      ) : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            zIndex: 70,
            display: "inline-flex",
            alignItems: "center",
            gap: "9px",
            background: "var(--ink)",
            color: "var(--surface)",
            borderRadius: "999px",
            padding: "11px 18px",
            fontSize: "13.5px",
            fontWeight: 600,
            boxShadow: "0 12px 34px rgba(0,0,0,.3)",
            animation: "fadeUp .25s ease both",
          }}
        >
          <Icon name="check" size={13} strokeWidth={3} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
