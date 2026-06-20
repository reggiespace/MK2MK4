"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ScheduleModal } from "./schedule-modal";

type Channel = { network: string; channelId: string; label?: string };

type Slide = {
  id: string;
  index: number;
  role: string;
  skin: string;
  eyebrow: string | null;
  headline: string | null;
  body: string | null;
  mediaAssetId: string | null;
};

type Piece = {
  id: string;
  format: string;
  caption: string;
  hashtags: string[];
  status: string;
  voiceover: string | null;
  voiceGender: "male" | "female" | null;
  motion: boolean;
  formatRationale: string | null;
  firstComment: string | null;
  costCents: number;
  slides: Slide[];
  mediaAssets: { id: string; url: string; type: string }[];
  renderJobs: { id: string; status: string; progress: number }[];
  idea: {
    title: string;
    angle: string;
    pillar: { name: string } | null;
    storyBrief: unknown;
  } | null;
  brand: { id: string; name: string; locale: string; publisher: string };
};

type ClaimsResult = {
  findings: { rule: string; level: string; text: string; autoFix?: string }[];
  blocks: number;
  warns: number;
  canSchedule: boolean;
  autoFixedText: string | null;
};

const SKIN_LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  mark_forward: "Mark Forward",
};

type SkinConfig = {
  bg: string;
  color: string;
  accent: string;
  scrim: string;
};

const SKIN_CONFIG: Record<string, SkinConfig> = {
  light: {
    bg: "#ECE6D6",
    color: "#1A2230",
    accent: "#5C7556",
    scrim: "linear-gradient(to top, rgba(26,34,48,0.08) 0%, transparent 60%)",
  },
  dark: {
    bg: "#0E141B",
    color: "#E5DECC",
    accent: "#94AE8A",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 35%)",
  },
  mark_forward: {
    bg: "linear-gradient(135deg, #3B5A78 0%, #5C7556 100%)",
    color: "#ECE6D6",
    accent: "#ECE6D6",
    scrim: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)",
  },
};

function SlidePreview({ slide, imageUrl }: { slide: Slide; imageUrl?: string }) {
  const cfg = SKIN_CONFIG[slide.skin] ?? SKIN_CONFIG.dark;

  if (imageUrl) {
    return (
      <div className="slide-preview" style={{ background: cfg.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={slide.headline ?? "slide"} className="slide-rendered-img" />
        <div className="slide-meta">
          <span className="slide-role-badge">{slide.role}</span>
          <span className="slide-skin-badge">{SKIN_LABELS[slide.skin] ?? slide.skin}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="slide-preview"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {/* scrim overlay */}
      <div className="slide-scrim" style={{ background: cfg.scrim }} />

      {/* top accent bar */}
      <div className="slide-accent-bar" style={{ background: cfg.accent }} />

      {/* content */}
      <div className="slide-content">
        {slide.eyebrow && (
          <p className="slide-eyebrow" style={{ color: cfg.accent }}>{slide.eyebrow}</p>
        )}
        {slide.headline && (
          <h2 className="slide-headline">{slide.headline}</h2>
        )}
        {slide.body && (
          <p className="slide-body">{slide.body}</p>
        )}
      </div>

      {/* badges */}
      <div className="slide-meta">
        <span className="slide-role-badge">{slide.role}</span>
        <span className="slide-skin-badge">{SKIN_LABELS[slide.skin] ?? slide.skin}</span>
      </div>
    </div>
  );
}

export function PieceReview({ piece: initial, brandChannels }: { piece: Piece; brandChannels: Channel[] }) {
  const [piece, setPiece] = useState(initial);
  const [activeSlide, setActiveSlide] = useState(0);
  const [caption, setCaption] = useState(initial.caption);
  const [hashtags] = useState(initial.hashtags);
  const [claims, setClaims] = useState<ClaimsResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [captionSaved, setCaptionSaved] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [motion, setMotionState] = useState(initial.motion);

  const runClaimsCheck = useCallback(async () => {
    setChecking(true);
    setClaims(null);
    try {
      const res = await fetch(`/api/pieces/${piece.id}/claims-check`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Claims check failed");
      setClaims(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setChecking(false);
    }
  }, [piece.id]);

  const regenerateCaption = useCallback(
    async (mode: "rewrite" | "shorten" | "more-hashtags") => {
      setRegenerating(true);
      setError("");
      try {
        const res = await fetch(`/api/pieces/${piece.id}/regenerate-caption`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
        setCaption(data.caption);
        setPiece((p) => ({ ...p, hashtags: data.hashtags }));
        setClaims(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setRegenerating(false);
      }
    },
    [piece.id],
  );

  const startRender = useCallback(async () => {
    setRendering(true);
    setError("");
    try {
      const res = await fetch(`/api/pieces/${piece.id}/render`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Render failed");
      setPiece((p) => ({ ...p, status: "rendering", renderJobs: [data.job] }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRendering(false);
    }
  }, [piece.id]);

  const setVoiceGender = useCallback(
    async (gender: "male" | "female") => {
      setPiece((p) => ({ ...p, voiceGender: gender }));
      try {
        await fetch(`/api/pieces/${piece.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceGender: gender }),
        });
      } catch {
        // non-critical
      }
    },
    [piece.id],
  );

  const setMotion = useCallback(
    async (value: boolean) => {
      setMotionState(value);
      try {
        await fetch(`/api/pieces/${piece.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motion: value }),
        });
      } catch {
        // non-critical
      }
    },
    [piece.id],
  );

  const saveCaption = useCallback(async () => {
    try {
      await fetch(`/api/pieces/${piece.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      setCaptionSaved(true);
      setTimeout(() => setCaptionSaved(false), 2000);
    } catch {
      // non-critical
    }
  }, [piece.id, caption]);

  useEffect(() => {
    const status = piece.renderJobs[0]?.status;
    if (status !== "queued" && status !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pieces/${piece.id}/render`);
        const data = await res.json();
        if (!res.ok || !data.jobs?.length) return;
        const jobs: { id: string; status: string; progress: number }[] = data.jobs;
        setPiece((p) => ({ ...p, renderJobs: jobs }));

        if (jobs[0].status === "done") {
          clearInterval(interval);
          const pieceRes = await fetch(`/api/pieces/${piece.id}`);
          const pieceData = await pieceRes.json();
          if (pieceRes.ok && pieceData.piece) {
            setPiece(pieceData.piece);
          }
        } else if (jobs[0].status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // non-critical
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [piece.id, piece.renderJobs]);

  const latestJob = piece.renderJobs[0];

  const rawStoryBrief = piece.idea?.storyBrief;
  const storyBrief =
    rawStoryBrief &&
    typeof rawStoryBrief === "object" &&
    typeof (rawStoryBrief as Record<string, unknown>).story === "string" &&
    typeof (rawStoryBrief as Record<string, unknown>).keyMessage === "string" &&
    Array.isArray((rawStoryBrief as Record<string, unknown>).beats)
      ? (rawStoryBrief as { story: string; keyMessage: string; beats: string[]; ctaIntent: string })
      : null;

  // Build slide index → rendered image URL map (carousel/image only).
  const slideImageUrls = new Map<number, string>();
  for (const slide of piece.slides) {
    if (slide.mediaAssetId) {
      const asset = piece.mediaAssets.find((a) => a.id === slide.mediaAssetId);
      if (asset) slideImageUrls.set(slide.index, asset.url);
    }
  }
  const videoAsset = piece.mediaAssets.find((a) => a.type === "video");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/pieces" className="back-link">← Back</Link>
          <h1 className="page-title">{piece.idea?.title ?? "Draft"}</h1>
          {piece.idea?.pillar && (
            <p className="muted">{piece.idea.pillar.name}</p>
          )}
        </div>
        <div className="page-header-right">
          <span className={`badge badge-status badge-${piece.status}`}>{piece.status}</span>
          <span className="badge badge-format">{piece.format}</span>
          <span className="muted">{piece.brand.name}</span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="review-layout">
        {/* LEFT: Slides */}
        <div className="review-slides">
          <p className="eyebrow">Slides</p>

          {piece.slides.length === 0 ? (
            <p className="muted">No slides generated.</p>
          ) : (
            <>
              <div className="slide-carousel">
                <SlidePreview
                  slide={piece.slides[activeSlide]}
                  imageUrl={slideImageUrls.get(piece.slides[activeSlide].index)}
                />
              </div>
              {piece.slides.length > 1 && (
                <div className="slide-dots">
                  {piece.slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`slide-dot ${i === activeSlide ? "active" : ""}`}
                      onClick={() => setActiveSlide(i)}
                    />
                  ))}
                </div>
              )}
              <div className="slide-nav">
                <button
                  type="button"
                  className="ghost sm"
                  disabled={activeSlide === 0}
                  onClick={() => setActiveSlide((n) => n - 1)}
                >
                  ←
                </button>
                <span className="muted">
                  {activeSlide + 1} / {piece.slides.length}
                </span>
                <button
                  type="button"
                  className="ghost sm"
                  disabled={activeSlide === piece.slides.length - 1}
                  onClick={() => setActiveSlide((n) => n + 1)}
                >
                  →
                </button>
              </div>
              {videoAsset && (
                <video
                  key={videoAsset.url}
                  className="slide-video-preview"
                  src={videoAsset.url}
                  controls
                  playsInline
                />
              )}
            </>
          )}

          {/* Render actions */}
          <div className="render-section">
            <p className="eyebrow">Media</p>
            {latestJob ? (
              <div className="job-status">
                <span className={`dot ${latestJob.status === "done" ? "ok" : latestJob.status === "failed" ? "err" : "pending"}`} />
                Worker: {latestJob.status}
                {latestJob.status === "running" && ` (${latestJob.progress}%)`}
              </div>
            ) : (
              <p className="muted">No render started yet.</p>
            )}
            {latestJob && (latestJob.status === "queued" || latestJob.status === "running") && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${latestJob.progress}%` }} />
              </div>
            )}
            <button
              type="button"
              className="btn sm"
              onClick={startRender}
              disabled={rendering || piece.status === "rendering"}
            >
              {rendering ? "Starting…" : piece.status === "rendering" ? "Rendering…" : "Render media"}
            </button>
          </div>

          {/* Voiceover (reels) */}
          {piece.format === "reel" && (
            <div className="voiceover-section">
              <div className="voice-gender">
                <p className="eyebrow">
                  Voice ({piece.brand.locale === "pt_BR" ? "BR" : "US"})
                </p>
                <div className="voice-gender-toggle">
                  {(["female", "male"] as const).map((g) => {
                    const active = (piece.voiceGender ?? "female") === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        className={`ghost sm ${active ? "active" : ""}`}
                        aria-pressed={active}
                        onClick={() => setVoiceGender(g)}
                      >
                        {g === "female" ? "Female" : "Male"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="motion-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={motion}
                    onChange={(e) => setMotion(e.target.checked)}
                  />
                  {" "}Animate (AI motion)
                </label>
                <p className="muted sm">Costs more and takes a few minutes.</p>
              </div>
              {piece.voiceover && (
                <>
                  <p className="eyebrow">Voiceover script</p>
                  <p className="voiceover-text">{piece.voiceover}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Caption + claims */}
        <div className="review-copy">
          <p className="eyebrow">Caption</p>
          <textarea
            className="textarea caption-textarea"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
          />
          <div className="caption-actions">
            <button
              type="button"
              className="ghost sm"
              onClick={saveCaption}
            >
              {captionSaved ? "Saved ✓" : "Save edits"}
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => regenerateCaption("rewrite")}
              disabled={regenerating}
            >
              Rewrite
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => regenerateCaption("shorten")}
              disabled={regenerating}
            >
              Shorten
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => regenerateCaption("more-hashtags")}
              disabled={regenerating}
            >
              More hashtags
            </button>
          </div>

          {hashtags.length > 0 && (
            <div className="hashtags">
              {hashtags.map((h) => (
                <span key={h} className="hashtag">{h}</span>
              ))}
            </div>
          )}

          {piece.formatRationale && (
            <div className="rationale">
              <p className="eyebrow">Format rationale</p>
              <p className="muted">{piece.formatRationale}</p>
            </div>
          )}

          {storyBrief && (
            <div className="story-brief">
              <p className="eyebrow">Story</p>
              <p className="voiceover-text">{storyBrief.story}</p>
              <p className="muted sm"><strong>Key message:</strong> {storyBrief.keyMessage}</p>
              {storyBrief.beats.length > 0 && (
                <p className="muted sm">{storyBrief.beats.join(" → ")}</p>
              )}
            </div>
          )}

          {piece.firstComment && (
            <div className="first-comment">
              <p className="eyebrow">First comment</p>
              <p className="voiceover-text">{piece.firstComment}</p>
            </div>
          )}

          {/* Claims check */}
          <div className="claims-section">
            <div className="claims-header">
              <p className="eyebrow">Claims check</p>
              <button
                type="button"
                className="ghost sm"
                onClick={runClaimsCheck}
                disabled={checking}
              >
                {checking ? "Checking…" : "Run check"}
              </button>
            </div>

            {claims && (
              <div className="claims-result">
                <div className={`claims-summary ${claims.canSchedule ? "pass" : "block"}`}>
                  {claims.canSchedule ? (
                    <span>✓ Clear to schedule ({claims.warns} warning{claims.warns !== 1 ? "s" : ""})</span>
                  ) : (
                    <span>✗ {claims.blocks} block{claims.blocks !== 1 ? "s" : ""} — cannot schedule</span>
                  )}
                </div>

                {claims.findings.length > 0 && (
                  <ul className="claims-list">
                    {claims.findings.map((f, i) => (
                      <li key={i} className={`claim-item claim-${f.level}`}>
                        <span className={`claim-badge ${f.level}`}>{f.level}</span>
                        <span className="claim-text">{f.text}</span>
                        {f.autoFix && (
                          <span className="claim-fix">→ &ldquo;{f.autoFix}&rdquo;</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {claims.autoFixedText && (
                  <div className="autofix-banner">
                    Auto-fixes available. Apply them before scheduling.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Schedule CTA */}
          <div className="schedule-cta">
            <button
              type="button"
              className="btn"
              disabled={claims !== null && !claims.canSchedule}
              onClick={() => setShowSchedule(true)}
            >
              Schedule post
            </button>
            {claims !== null && !claims.canSchedule && (
              <p className="error sm">Resolve claims blocks before scheduling.</p>
            )}
          </div>

          {showSchedule && (
            <ScheduleModal
              pieceId={piece.id}
              brandChannels={brandChannels}
              onClose={() => setShowSchedule(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
