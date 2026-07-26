/**
 * The one slide renderer.
 *
 * Every surface draws through this component — template-picker miniatures, the
 * fill workspace preview, the thumbnail strip, the Review cover, and the
 * headless export that produces the published PNG. One renderer, many sizes, so
 * what you approve in Review is pixel-identical to what you filled.
 *
 * The component always draws at the manifest's `base` dimensions; `SlideFrame`
 * scales it. Never add a second renderer.
 *
 * Geometry note: a base px becomes `SAFE[style].scale` canvas px in the export
 * (3.176x for the 4:5 formats, 4.286x for 9:16). Anything that has to clear
 * Instagram's UI overlays therefore lives in `@/lib/templates/safezone` as a
 * named anchor rather than as a literal here — see that file, and the tests that
 * assert the anchors are still legal.
 */

import type { CSSProperties, ReactNode } from "react";
import { getManifest } from "@/lib/templates/manifests";
import {
  FEED_PAD,
  MIN_FIT_PX,
  REEL_LAYOUT,
  REEL_TYPE,
  STORY_LAYOUT,
  STORY_TYPE,
  chromeBase,
  type Insets,
} from "@/lib/templates/safezone";
import { FONTS, ground, inkOn, readableOn, safeOn } from "@/lib/templates/theme";
import type { ImageValue, PairItem, QuizOption, SlideDoc, TemplateStyleId } from "@/lib/templates/types";
import { isImageValue, isPairItems, isQuizOptions, isStringList } from "@/lib/templates/types";

export interface SlideContext {
  style: TemplateStyleId;
  accent: string;
  brand: string;
  handle: string;
  /** Monogram shown in reel/story/photo brand chips when there is no logo. */
  initials: string;
  /** Brand logo, drawn in place of the monogram wherever a chip appears. */
  logoUrl?: string | null;
}

interface SlideProps {
  slide: SlideDoc;
  index: number;
  total: number;
  ctx: SlideContext;
}

// ── type helpers ────────────────────────────────────────────────────────────
const sf = (size: number, weight: number, ex?: CSSProperties): CSSProperties => ({
  fontFamily: FONTS.display,
  fontWeight: weight,
  fontSize: `${size}px`,
  ...ex,
});
const mn = (size: number, ex?: CSSProperties): CSSProperties => ({
  fontFamily: FONTS.mono,
  fontSize: `${size}px`,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  ...ex,
});
const sans = (size: number, weight = 400, ex?: CSSProperties): CSSProperties => ({
  fontFamily: FONTS.sans,
  fontWeight: weight,
  fontSize: `${size}px`,
  ...ex,
});

/**
 * Dark halo for copy set over imagery.
 *
 * A gradient scrim alone can't be trusted: it is thinnest exactly where the reel
 * hook now sits (the 200-600 canvas band), and a bright frame from fal.ai will
 * punch through it. Four hairline offsets plus two blurs read as the brief's
 * "dark stroke" while staying quiet enough for an editorial face — and because
 * the offsets are base px they scale with the frame like everything else.
 */
const overImage = (px = 1): CSSProperties => ({
  textShadow: [
    `${px}px 0 0 rgba(10,12,16,.62)`,
    `-${px}px 0 0 rgba(10,12,16,.62)`,
    `0 ${px}px 0 rgba(10,12,16,.62)`,
    `0 -${px}px 0 rgba(10,12,16,.62)`,
    `0 0 ${px * 6}px rgba(10,12,16,.72)`,
    `0 ${px * 2}px ${px * 10}px rgba(10,12,16,.5)`,
  ].join(","),
});

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Fit guardrail for the dominant single-token slots (`statValue`, `bigWord`).
 *
 * These render as one unbreakable word at a very large size, so a value near
 * the manifest's character budget overflows the frame instead of wrapping —
 * "willpower" at 56px is wider than a reel's safe box. Shrink the type to fit
 * rather than let published art spill, in the same spirit as the accent
 * guardrail: the value is always safe, nothing needs hand-tuning per slide.
 *
 * 0.55em is a workable average advance for Spectral at weights 700–800. The
 * `MIN_FIT_PX` floor is set so that even a fully shrunk token stays above the
 * 45px on-screen type floor once a reel is scaled to canvas.
 */
function fitToWidth(text: string, baseSize: number, availableWidth: number): number {
  const chars = text.trim().length;
  if (!chars) return baseSize;
  const needed = availableWidth / (chars * 0.55);
  return Math.max(MIN_FIT_PX, Math.min(baseSize, needed));
}

// ── field accessors (tolerate any persisted shape) ──────────────────────────
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const img = (v: unknown): ImageValue | null => (isImageValue(v as never) ? (v as ImageValue) : null);
const pairs = (v: unknown): PairItem[] => (isPairItems(v as never) ? (v as PairItem[]) : []);
const quiz = (v: unknown): QuizOption[] => (isQuizOptions(v as never) ? (v as QuizOption[]) : []);
const strings = (v: unknown): string[] => (isStringList(v as never) ? (v as string[]) : []);

function ImgFill({ image }: { image: ImageValue | null }) {
  const badge = image?.ai ? (
    <span
      style={{
        position: "absolute",
        top: "8px",
        left: "8px",
        ...mn(8, { letterSpacing: ".06em" }),
        background: "#5c7556",
        color: "#f4efe0",
        padding: "2px 7px",
        borderRadius: "999px",
      }}
    >
      AI
    </span>
  ) : null;

  if (image?.url) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${image.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {badge}
      </div>
    );
  }
  if (image?.tint) {
    return <div style={{ position: "absolute", inset: 0, background: image.tint }}>{badge}</div>;
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        color: "rgba(244,239,224,.5)",
        ...mn(8, { letterSpacing: ".18em" }),
      }}
    >
      <span>IMAGE</span>
      <span>fal.ai</span>
    </div>
  );
}

/**
 * Slide chrome, defined at module scope. Declaring these inside `Slide` would
 * create a fresh component type on every render, remounting the whole slide on
 * each keystroke in the editor.
 */
function SlideRoot({
  w,
  h,
  g,
  extra,
  children,
}: {
  w: number;
  h: number;
  g: { bg: string; fg: string };
  extra?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: `${w}px`,
        height: `${h}px`,
        overflow: "hidden",
        background: g.bg,
        color: g.fg,
        fontFamily: FONTS.sans,
        ...extra,
      }}
    >
      {children}
    </div>
  );
}

/** Safe-zone inset. Per-side, because 9:16 is far from symmetric. */
function SlideInset({ inset, children }: { inset: Insets; children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: `${inset.top}px`,
        right: `${inset.right}px`,
        bottom: `${inset.bottom}px`,
        left: `${inset.left}px`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The brand mark in reel, story and photo chips.
 *
 * Draws the account's logo when one is set, and the initials monogram when it
 * isn't — so a workspace that never uploads a mark keeps exactly the design's
 * lettered square, and one that does gets its own logo everywhere the monogram
 * used to be, with no per-template wiring.
 *
 * `contain` rather than `cover`: a logo cropped to fill is a broken logo. The
 * accent stays as the tile behind it so a transparent PNG still reads as a
 * mark rather than a hole, and the corner radius matches the monogram it
 * replaces.
 */
function BrandMark({
  size,
  radius,
  accent,
  ink,
  fontSize,
  initials,
  logoUrl,
}: {
  size: number;
  radius: number;
  accent: string;
  ink: string;
  fontSize: number;
  initials: string;
  logoUrl?: string | null;
}) {
  const box: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${radius}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  };

  if (logoUrl) {
    return (
      <span
        style={{
          ...box,
          background: `url(${logoUrl}) center/contain no-repeat, ${accent}`,
        }}
      />
    );
  }

  return (
    <span style={{ ...box, background: accent, color: ink, ...sf(fontSize, 800) }}>{initials}</span>
  );
}

const FEED_INSET: Insets = { top: FEED_PAD, right: FEED_PAD, bottom: FEED_PAD, left: FEED_PAD };

export function Slide({ slide, index, total, ctx }: SlideProps) {
  const style = ctx.style;
  const man = getManifest(style);
  const { w, h } = man.base;
  const kind = man.kinds[slide.kind];
  const g = ground(kind?.ground ?? "light");
  const f = slide.f ?? {};
  const acc = ctx.accent;
  const brand = ctx.brand;
  const handle = ctx.handle;
  const counter = `${p2(index + 1)}/${p2(total)}`;
  const k = slide.kind;

  /** Accent used as words — held to the body-copy bar, not the graphic bar. */
  const accText = readableOn(acc, g.base);
  /** Accent used as a large graphic mark: 3:1 is AA for text this size. */
  const accMark = safeOn(acc, g.base, 3);
  /** Foreground for copy printed on an accent fill. */
  const accInk = inkOn(acc);

  const inset: Insets =
    style === "reel"
      ? {
          top: REEL_LAYOUT.ctaTop,
          right: REEL_LAYOUT.right,
          bottom: REEL_LAYOUT.ctaBottom,
          left: REEL_LAYOUT.left,
        }
      : style === "story"
        ? chromeBase("story")
        : FEED_INSET;

  const cHdr = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={sf(11, 700)}>{brand}</span>
      <span style={mn(8, { color: g.sub })}>{counter}</span>
    </div>
  );

  const bar = (pct: string) => (
    <div style={{ height: "3px", borderRadius: "999px", background: "rgba(26,34,48,.12)", marginTop: "7px" }}>
      <div style={{ height: "100%", width: pct, background: acc, borderRadius: "999px" }} />
    </div>
  );

  const swipe = (
    <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", paddingTop: "8px" }}>
      <span style={sans(9, 600, { color: g.sub })}>Swipe →</span>
    </div>
  );

  const dots = (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {Array.from({ length: total }, (_, d) => (
        <span
          key={d}
          style={{
            width: d === 0 ? "11px" : "4px",
            height: "4px",
            borderRadius: "999px",
            background: d === 0 ? acc : "rgba(244,239,224,.32)",
          }}
        />
      ))}
    </div>
  );

  // ── CAROUSEL ──────────────────────────────────────────────────────────────
  if (k === "1a-knockout") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {cHdr}
          <div style={{ marginTop: "auto" }}>
            {txt(f.kicker) ? (
              <div style={mn(8, { color: accText, marginBottom: "10px" })}>{txt(f.kicker)}</div>
            ) : null}
            <h2 style={sf(40, 800, { margin: 0, lineHeight: 0.97, letterSpacing: "-.01em" })}>{txt(f.hook)}</h2>
          </div>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "11px",
              borderTop: "1.5px solid rgba(244,239,224,.22)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {dots}
            <span style={sans(9, 600, { color: "#f4efe0" })}>Swipe →</span>
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "1b-editorial") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderBottom: "2px solid #1a2230",
              paddingBottom: "7px",
            }}
          >
            <span style={mn(8, { color: accText })}>{txt(f.kicker)}</span>
            <span style={mn(8, { color: g.sub })}>{counter}</span>
          </div>
          <h2 style={sf(30, 700, { margin: "16px 0 0", lineHeight: 1, letterSpacing: "-.01em" })}>{txt(f.hook)}</h2>
          <div style={{ width: "56px", height: "3px", background: acc, margin: "14px 0", borderRadius: "999px" }} />
          {txt(f.lead) ? (
            <p style={sans(12, 500, { margin: 0, lineHeight: 1.4, color: g.sub, maxWidth: "22ch" })}>{txt(f.lead)}</p>
          ) : null}
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={sf(11, 700)}>{brand}</span>
            <span style={sans(9, 600, { color: g.sub })}>Swipe →</span>
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "1c-bigstat" || k === "1a-stat") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={mn(8, { color: accText })}>{txt(f.kicker)}</span>
            <span style={mn(8, { color: g.sub })}>{style === "single" ? brand : counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            <div
              style={sf(fitToWidth(txt(f.statValue), 94, w - inset.left - inset.right), 800, {
                lineHeight: 0.8,
                letterSpacing: "-.03em",
                color: accMark,
              })}
            >
              {txt(f.statValue)}
            </div>
            <h2 style={sf(20, 700, { margin: "12px 0 0", lineHeight: 1.08, maxWidth: "17ch" })}>{txt(f.statLine)}</h2>
          </div>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "10px",
              borderTop: "1.5px solid rgba(244,239,224,.24)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={sans(8, 400, { color: g.sub })}>{txt(f.source) ? `Source: ${txt(f.source)}` : ""}</span>
            <span style={sf(10, 700)}>{brand}</span>
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "1d-quote" || (style === "single" && k === "1b-quote")) {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={mn(8, { color: accText })}>{txt(f.kicker)}</span>
            <span style={mn(8, { color: g.sub })}>{style === "single" ? brand : counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            <div style={sf(72, 800, { lineHeight: 0.5, height: "34px", color: accMark })}>&ldquo;</div>
            <h2 style={sf(26, 700, { fontStyle: "italic", margin: 0, lineHeight: 1.14 })}>{txt(f.quote)}</h2>
            {txt(f.attribution) ? (
              <div style={sans(11, 600, { color: g.sub, marginTop: "16px" })}>{txt(f.attribution)}</div>
            ) : null}
          </div>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "10px",
              borderTop: "1.5px solid rgba(244,239,224,.24)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={sf(10, 700)}>{brand}</span>
            <span style={sans(9, 600, { color: g.sub })}>Swipe →</span>
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2a-point") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {cHdr}
          {bar("43%")}
          <div style={{ margin: "auto 0" }}>
            <div style={sf(46, 800, { lineHeight: 0.8, color: accMark })}>{txt(f.index)}</div>
            {txt(f.label) ? <div style={mn(8, { color: g.sub, margin: "12px 0 6px" })}>{txt(f.label)}</div> : null}
            <h2 style={sf(24, 700, { margin: 0, lineHeight: 1.04 })}>{txt(f.heading)}</h2>
            {txt(f.body) ? (
              <p style={sans(11, 400, { margin: "10px 0 0", lineHeight: 1.42, color: g.sub, maxWidth: "26ch" })}>
                {txt(f.body)}
              </p>
            ) : null}
          </div>
          {swipe}
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2b-stat") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {cHdr}
          {bar("57%")}
          <div
            style={{
              margin: "auto 0",
              background: "#faf7ec",
              border: "2px solid rgba(26,34,48,.1)",
              borderRadius: "16px",
              padding: "22px 20px",
            }}
          >
            {txt(f.label) ? (
              <div style={mn(8, { color: readableOn(acc, "#faf7ec"), marginBottom: "8px" })}>{txt(f.label)}</div>
            ) : null}
            <div
              style={sf(fitToWidth(txt(f.statValue), 60, w - inset.left - inset.right - 40), 800, {
                lineHeight: 0.82,
                letterSpacing: "-.02em",
              })}
            >
              {txt(f.statValue)}
            </div>
            <h2 style={sf(19, 600, { margin: "12px 0 0", lineHeight: 1.1, maxWidth: "18ch" })}>{txt(f.statLine)}</h2>
          </div>
          {swipe}
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2c-list") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {cHdr}
          {bar("71%")}
          <h2 style={sf(23, 700, { margin: "16px 0 14px", lineHeight: 1.02, maxWidth: "16ch" })}>{txt(f.heading)}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            {pairs(f.items).map((it, j) => (
              <div key={j} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    background: acc,
                    color: accInk,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
                <div>
                  <div style={sf(15, 700, { lineHeight: 1.1 })}>{it.lead}</div>
                  {it.detail ? <div style={sans(11, 400, { color: g.sub, marginTop: "2px" })}>{it.detail}</div> : null}
                </div>
              </div>
            ))}
          </div>
          {swipe}
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2d-image") {
    const image = img(f.image);
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {cHdr}
          {bar("86%")}
          <div
            style={{
              flex: 1,
              marginTop: "12px",
              borderRadius: "14px",
              overflow: "hidden",
              position: "relative",
              border: image ? "none" : "3px dashed rgba(26,34,48,.28)",
              background: "#e0dac9",
            }}
          >
            <ImgFill image={image} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <div style={sf(16, 700, { lineHeight: 1.08 })}>{txt(f.caption)}</div>
            {txt(f.captionSub) ? (
              <div style={sans(11, 400, { color: g.sub, marginTop: "4px" })}>{txt(f.captionSub)}</div>
            ) : null}
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2e-myth" || (style === "single" && k === "1c-myth")) {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {style === "single" ? <div style={mn(8, { color: accText })}>Myth vs fact</div> : cHdr}
          {style === "single" ? null : bar("57%")}
          <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#e0dac9", borderRadius: "14px", padding: "16px 18px" }}>
              {/* #8a8672 / #6e6952 measured 2.62:1 and 3.95:1 on this card. */}
              <div style={mn(8, { color: "#5f5b46", marginBottom: "6px" })}>Myth</div>
              <div
                style={sf(18, 600, {
                  lineHeight: 1.08,
                  color: "#524e3b",
                  textDecoration: "line-through",
                  textDecorationThickness: "2px",
                })}
              >
                {txt(f.myth)}
              </div>
            </div>
            <div style={{ background: acc, borderRadius: "14px", padding: "16px 18px", color: accInk }}>
              <div style={mn(8, { marginBottom: "6px" })}>Fact</div>
              <div style={sf(20, 700, { lineHeight: 1.06 })}>{txt(f.fact)}</div>
            </div>
          </div>
          {style === "single" ? <div style={{ marginTop: "auto", ...sf(10, 700), color: accText }}>{brand}</div> : swipe}
        </SlideInset>
      </SlideRoot>
    );
  }

  if (k === "2f-cta" || k === "1f-cta") {
    const recap = strings(f.recap);
    // The reel's end frame reuses this layout at 252x448, where 4.29x scaling
    // drops the feed sizes under the 45px on-screen floor.
    const isReel = style === "reel";
    const t = isReel
      ? {
          brand: REEL_TYPE.ctaBrand,
          meta: REEL_TYPE.ctaMeta,
          hook: REEL_TYPE.ctaHook,
          recap: REEL_TYPE.ctaRecap,
          recapWeight: 700,
          follow: REEL_TYPE.ctaFollow,
          save: REEL_TYPE.ctaSave,
          gap: 6,
        }
      : { brand: 11, meta: 8, hook: 30, recap: 12, recapWeight: 500, follow: 10, save: 11, gap: 7 };
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={sf(t.brand, 700)}>{brand}</span>
            <span style={mn(t.meta, { fontWeight: isReel ? 700 : 400, color: accText })}>{counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            {txt(f.kicker) ? (
              <div style={mn(t.meta, { fontWeight: isReel ? 700 : 400, color: accText, marginBottom: "10px" })}>
                {txt(f.kicker)}
              </div>
            ) : null}
            <h2 style={sf(t.hook, 800, { margin: "0 0 14px", lineHeight: 0.98, maxWidth: "15ch" })}>{txt(f.hook)}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: `${t.gap}px` }}>
              {recap.map((r, j) => (
                <div
                  key={j}
                  style={{ display: "flex", gap: "9px", alignItems: "center", ...sans(t.recap, t.recapWeight) }}
                >
                  <span style={{ color: accText, fontSize: `${t.recap + 2}px` }}>✓</span>
                  {r}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "11px",
              borderTop: "1.5px solid rgba(244,239,224,.22)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={sans(t.follow, isReel ? 700 : 600)}>{txt(f.followLine) || `Follow ${handle}`}</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: acc,
                color: accInk,
                ...sans(t.save, 700),
                padding: "8px 12px",
                borderRadius: "999px",
              }}
            >
              Save ⤓
            </span>
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  // ── REEL ──────────────────────────────────────────────────────────────────
  const brandChip = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(20,26,36,.62)",
        borderRadius: "999px",
        padding: "4px 10px 4px 5px",
      }}
    >
      <BrandMark
        size={20}
        radius={5}
        accent={acc}
        ink={accInk}
        fontSize={REEL_TYPE.monogram}
        initials={ctx.initials}
        logoUrl={ctx.logoUrl}
      />
      <span style={sans(REEL_TYPE.brand, 700, { color: "#f4efe0", ...overImage() })}>{brand}</span>
    </div>
  );

  const ticks = (active: number) => (
    <div
      style={{
        position: "absolute",
        top: `${REEL_LAYOUT.ticksTop}px`,
        left: `${REEL_LAYOUT.left}px`,
        right: `${REEL_LAYOUT.right}px`,
        display: "flex",
        gap: "5px",
      }}
    >
      {Array.from({ length: total }, (_, d) => (
        <span
          key={d}
          style={{
            flex: 1,
            height: "3px",
            borderRadius: "999px",
            background: d === active ? acc : "rgba(255,255,255,.32)",
          }}
        />
      ))}
    </div>
  );

  if (style === "reel") {
    // Mid-frame stops raised: the hook now sits at ~410-500 canvas px, where the
    // old ramp had thinned to .12 alpha and left type floating on raw imagery.
    const scrim = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg,rgba(10,12,16,.62) 0%,rgba(10,12,16,.34) 34%,rgba(10,12,16,.18) 58%,rgba(10,12,16,.74) 100%)",
        }}
      />
    );
    const chipAt = (
      <div style={{ position: "absolute", left: `${REEL_LAYOUT.left}px`, top: `${REEL_LAYOUT.chipTop}px` }}>
        {brandChip}
      </div>
    );

    if (k === "1a-statement") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${REEL_LAYOUT.left}px`,
              right: `${REEL_LAYOUT.rightStatement}px`,
              top: `${REEL_LAYOUT.hookTop}px`,
            }}
          >
            {txt(f.kicker) ? (
              <div
                style={mn(REEL_TYPE.kicker, {
                  fontWeight: 700,
                  color: accText,
                  marginBottom: "8px",
                  ...overImage(),
                })}
              >
                {txt(f.kicker)}
              </div>
            ) : null}
            <h2 style={sf(REEL_TYPE.hook, 800, { margin: 0, lineHeight: 1, color: g.fg, ...overImage() })}>
              {txt(f.hook)}
            </h2>
          </div>
        </SlideRoot>
      );
    }
    if (k === "1b-question") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${REEL_LAYOUT.left}px`,
              right: `${REEL_LAYOUT.rightHook}px`,
              top: `${REEL_LAYOUT.hookTop}px`,
            }}
          >
            <h2 style={sf(REEL_TYPE.hook, 800, { margin: 0, lineHeight: 1.02 })}>{txt(f.hook)}</h2>
            {txt(f.sub) ? (
              <p style={sans(REEL_TYPE.sub, 700, { margin: "14px 0 0", color: g.sub })}>{txt(f.sub)}</p>
            ) : null}
          </div>
        </SlideRoot>
      );
    }
    if (k === "1c-kinetic") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${REEL_LAYOUT.left}px`,
              right: `${REEL_LAYOUT.rightHook}px`,
              top: `${REEL_LAYOUT.hookTop}px`,
            }}
          >
            {txt(f.preWord) ? (
              <div style={sans(REEL_TYPE.preWord, 700, { color: accText, marginBottom: "2px" })}>{txt(f.preWord)}</div>
            ) : null}
            <div
              style={sf(
                fitToWidth(txt(f.bigWord), REEL_TYPE.bigWord, w - REEL_LAYOUT.left - REEL_LAYOUT.rightHook),
                800,
                { lineHeight: 0.92, letterSpacing: "-.02em" },
              )}
            >
              {txt(f.bigWord)}
            </div>
            {txt(f.sub) ? (
              <div style={sans(REEL_TYPE.sub, 700, { marginTop: "12px", color: g.sub })}>{txt(f.sub)}</div>
            ) : null}
          </div>
        </SlideRoot>
      );
    }
    if (k === "1d-title") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${REEL_LAYOUT.left}px`,
              right: `${REEL_LAYOUT.rightTitle}px`,
              top: `${REEL_LAYOUT.titleTop}px`,
            }}
          >
            {txt(f.kicker) ? (
              <div
                style={mn(REEL_TYPE.kicker, {
                  fontWeight: 700,
                  color: accText,
                  marginBottom: "8px",
                  ...overImage(),
                })}
              >
                {txt(f.kicker)}
              </div>
            ) : null}
            <h2 style={sf(REEL_TYPE.title, 800, { margin: 0, lineHeight: 1.04, color: g.fg, ...overImage() })}>
              {txt(f.title)}
            </h2>
            {txt(f.sub) ? (
              <p style={sans(REEL_TYPE.sub, 700, { margin: "10px 0 0", color: g.sub, ...overImage() })}>
                {txt(f.sub)}
              </p>
            ) : null}
          </div>
        </SlideRoot>
      );
    }
    if (k === "1e-caption") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${REEL_LAYOUT.left}px`,
              right: `${REEL_LAYOUT.right}px`,
              bottom: `${REEL_LAYOUT.captionBottom}px`,
              background: "rgba(20,26,36,.68)",
              borderRadius: "12px",
              padding: "12px 14px",
            }}
          >
            <div style={sans(REEL_TYPE.caption, 700, { lineHeight: 1.28, color: "#f4efe0" })}>{txt(f.caption)}</div>
          </div>
        </SlideRoot>
      );
    }
  }

  // ── STORY ─────────────────────────────────────────────────────────────────
  if (style === "story") {
    const image = img(f.image);
    // Decoration only — no copy — so this one anchor stays at the top of the
    // frame, echoing Instagram's own progress chrome. See safezone.ts.
    const segs = (
      <div
        style={{
          position: "absolute",
          top: `${STORY_LAYOUT.segsTop}px`,
          left: `${STORY_LAYOUT.segsSide}px`,
          right: `${STORY_LAYOUT.segsSide}px`,
          display: "flex",
          gap: "5px",
        }}
      >
        {Array.from({ length: total }, (_, d) => (
          <span
            key={d}
            style={{
              flex: 1,
              height: "3px",
              borderRadius: "999px",
              background: d <= index ? "#fff" : "rgba(255,255,255,.32)",
            }}
          />
        ))}
      </div>
    );
    const topbar = (
      <div
        style={{
          position: "absolute",
          top: `${STORY_LAYOUT.barTop}px`,
          left: `${STORY_LAYOUT.left}px`,
          display: "flex",
          alignItems: "center",
          gap: "7px",
        }}
      >
        <BrandMark
          size={22}
          radius={6}
          accent={acc}
          ink={accInk}
          fontSize={STORY_TYPE.monogram}
          initials={ctx.initials}
          logoUrl={ctx.logoUrl}
        />
        <span style={sans(STORY_TYPE.brand, 700, { color: "#fff", ...overImage() })}>{brand}</span>
      </div>
    );
    // Story frames have no built-in scrim, so an uploaded background used to put
    // white display type straight onto raw imagery. Only drawn when there is an
    // image to protect against.
    const storyScrim = image ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg,rgba(10,12,16,.55) 0%,rgba(10,12,16,.3) 32%,rgba(10,12,16,.24) 70%,rgba(10,12,16,.5) 100%)",
        }}
      />
    ) : null;
    // A plain function, not a component: returning elements avoids declaring a
    // new component type per render, which would remount the frame on each edit.
    const wrap = (children: ReactNode) => (
      <SlideRoot w={w} h={h} g={g} extra={{ background: image?.url || image?.tint ? undefined : g.bg }}>
        {image ? <ImgFill image={image} /> : null}
        {storyScrim}
        {segs}
        {topbar}
        {children}
      </SlideRoot>
    );
    const block = (top: number, children: ReactNode) => (
      <div
        style={{
          position: "absolute",
          left: `${STORY_LAYOUT.left}px`,
          right: `${STORY_LAYOUT.right}px`,
          top: `${top}px`,
        }}
      >
        {children}
      </div>
    );
    const storyKicker = (v: string) => (
      <div style={mn(STORY_TYPE.kicker, { fontWeight: 700, color: accText, marginBottom: "10px", ...overImage() })}>
        {v}
      </div>
    );

    if (k === "1a-poll") {
      return wrap(
        block(
          STORY_LAYOUT.pollTop,
          <>
            {txt(f.kicker) ? storyKicker(txt(f.kicker)) : null}
            <h2 style={sf(STORY_TYPE.prompt, 800, { margin: "0 0 20px", lineHeight: 1, color: "#f4efe0", ...overImage() })}>
              {txt(f.prompt)}
            </h2>
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "6px",
                boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              }}
            >
              <div style={sans(STORY_TYPE.option, 700, { textAlign: "center", color: "#1a2230", padding: "11px 0" })}>
                {txt(f.optionA)}
              </div>
              <div style={{ height: "1.5px", background: "rgba(26,34,48,.12)" }} />
              <div style={sans(STORY_TYPE.option, 700, { textAlign: "center", color: "#1a2230", padding: "11px 0" })}>
                {txt(f.optionB)}
              </div>
            </div>
          </>,
        ),
      );
    }
    if (k === "1b-question") {
      return wrap(
        block(
          STORY_LAYOUT.questionTop,
          <>
            <h2
              style={sf(STORY_TYPE.prompt, 800, { margin: "0 0 18px", lineHeight: 1.02, color: "#f4efe0", ...overImage() })}
            >
              {txt(f.prompt)}
            </h2>
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "16px 16px 20px",
                boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              }}
            >
              <div style={sans(STORY_TYPE.sticker, 700, { color: "#1a2230", marginBottom: "12px" })}>
                {txt(f.stickerLabel)}
              </div>
              <div style={{ height: "34px", borderRadius: "9px", background: "#eee7d7" }} />
            </div>
          </>,
        ),
      );
    }
    if (k === "1c-quiz") {
      return wrap(
        block(
          STORY_LAYOUT.quizTop,
          <>
            {txt(f.kicker) ? storyKicker(txt(f.kicker)) : null}
            <h2
              style={sf(STORY_TYPE.promptSm, 800, {
                margin: "0 0 18px",
                lineHeight: 1.04,
                color: "#f4efe0",
                ...overImage(),
              })}
            >
              {txt(f.prompt)}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {quiz(f.options).map((o, j) => (
                <div
                  key={j}
                  style={{
                    background: o.correct ? acc : "#fff",
                    color: o.correct ? accInk : "#1a2230",
                    borderRadius: "11px",
                    padding: "12px 14px",
                    ...sans(STORY_TYPE.optionSm, 700),
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 8px 20px rgba(0,0,0,.22)",
                  }}
                >
                  {o.t}
                  {o.correct ? <span style={{ marginLeft: "auto" }}>✓</span> : null}
                </div>
              ))}
            </div>
          </>,
        ),
      );
    }
    if (k === "1d-slider") {
      return wrap(
        block(
          STORY_LAYOUT.sliderTop,
          <>
            <h2
              style={sf(STORY_TYPE.promptSm, 800, {
                margin: "0 0 20px",
                lineHeight: 1.04,
                color: "#f4efe0",
                ...overImage(),
              })}
            >
              {txt(f.prompt)}
            </h2>
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "20px 16px",
                boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              }}
            >
              <div
                style={{
                  position: "relative",
                  height: "8px",
                  borderRadius: "999px",
                  background: `linear-gradient(90deg,#e0d6bf,${acc})`,
                }}
              >
                <span style={{ position: "absolute", left: "58%", top: "-11px", fontSize: "26px" }}>
                  {txt(f.emoji) || "🔊"}
                </span>
              </div>
            </div>
          </>,
        ),
      );
    }
    if (k === "1e-countdown") {
      return wrap(
        block(
          STORY_LAYOUT.countdownTop,
          <>
            {txt(f.kicker) ? storyKicker(txt(f.kicker)) : null}
            <h2
              style={sf(STORY_TYPE.promptSm, 800, {
                margin: "0 0 18px",
                lineHeight: 1.04,
                color: "#f4efe0",
                ...overImage(),
              })}
            >
              {txt(f.headline)}
            </h2>
            <div
              style={{
                background: "rgba(255,255,255,.14)",
                border: "1px solid rgba(255,255,255,.25)",
                borderRadius: "12px",
                padding: "14px",
                textAlign: "center",
                marginBottom: "14px",
              }}
            >
              <div style={mn(STORY_TYPE.meta, { fontWeight: 700, color: "rgba(255,255,255,.8)", marginBottom: "6px" })}>
                {txt(f.targetTime)}
              </div>
              <div style={sf(STORY_TYPE.timer, 800, { color: "#fff" })}>06 : 12 : 40</div>
            </div>
            <div
              style={{
                background: acc,
                color: accInk,
                borderRadius: "999px",
                padding: "11px",
                textAlign: "center",
                ...sans(STORY_TYPE.link, 700),
              }}
            >
              {txt(f.linkLabel)}
            </div>
          </>,
        ),
      );
    }
    if (k === "1f-reshare") {
      // Inset further than the other frames: the preview is locked to 4:5, so
      // its height follows its width, and at the shared 22px inset the card ran
      // ~100 canvas px into the reply bar. Narrowing is the only lever that does
      // not change the layout.
      return wrap(
        <div
          style={{
            position: "absolute",
            left: `${STORY_LAYOUT.reshareSide}px`,
            right: `${STORY_LAYOUT.reshareSide}px`,
            top: `${STORY_LAYOUT.reshareTop}px`,
          }}
        >
          {txt(f.flag) ? (
            <div
              style={{
                display: "inline-block",
                background: acc,
                color: accInk,
                ...sans(STORY_TYPE.flag, 700),
                padding: "5px 11px",
                borderRadius: "999px",
                marginBottom: "12px",
              }}
            >
              {txt(f.flag)}
            </div>
          ) : null}
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "12px",
              boxShadow: "0 12px 30px rgba(0,0,0,.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
              <span style={{ width: "22px", height: "22px", borderRadius: "999px", background: acc }} />
              <span style={sans(STORY_TYPE.handle, 700, { color: "#1a2230" })}>{handle}</span>
            </div>
            <div
              style={{
                aspectRatio: "4/5",
                borderRadius: "9px",
                background: "linear-gradient(150deg,#3b5a78,#5c7556)",
              }}
            />
          </div>
        </div>,
      );
    }
  }

  // ── SINGLE announcement ───────────────────────────────────────────────────
  if (k === "1d-announce") {
    return (
      <SlideRoot w={w} h={h} g={g}>
        <SlideInset inset={inset}>
          {txt(f.pill) ? (
            <div
              style={{
                display: "inline-block",
                alignSelf: "flex-start",
                background: acc,
                color: accInk,
                ...sans(11, 800),
                padding: "5px 12px",
                borderRadius: "999px",
              }}
            >
              {txt(f.pill)}
            </div>
          ) : null}
          <div style={{ margin: "auto 0" }}>
            {txt(f.kicker) ? (
              <div style={mn(8, { color: accText, marginBottom: "10px" })}>{txt(f.kicker)}</div>
            ) : null}
            <h2 style={sf(34, 800, { margin: 0, lineHeight: 0.98, letterSpacing: "-.01em" })}>{txt(f.headline)}</h2>
            {txt(f.sub) ? (
              <p style={sans(13, 600, { margin: "14px 0 0", color: g.sub, maxWidth: "24ch" })}>{txt(f.sub)}</p>
            ) : null}
          </div>
          <div
            style={{
              marginTop: "auto",
              paddingTop: "11px",
              borderTop: "1.5px solid rgba(244,239,224,.22)",
              ...sf(11, 700),
            }}
          >
            {brand}
          </div>
        </SlideInset>
      </SlideRoot>
    );
  }

  // ── PHOTO ─────────────────────────────────────────────────────────────────
  if (style === "photo") {
    const image = img(f.image);
    const scrim = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg,rgba(20,20,14,.15) 0%,rgba(20,20,14,.05) 45%,rgba(20,20,14,.78) 100%)",
        }}
      />
    );
    const chip = (
      <div
        style={{
          position: "absolute",
          top: `${FEED_PAD}px`,
          left: `${FEED_PAD}px`,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(20,26,36,.42)",
          borderRadius: "999px",
          padding: "4px 11px 4px 5px",
        }}
      >
        <BrandMark
          size={16}
          radius={5}
          accent={acc}
          ink={accInk}
          fontSize={8}
          initials={ctx.initials}
          logoUrl={ctx.logoUrl}
        />
        <span style={sans(9, 700, { color: "#f4efe0", ...overImage() })}>{brand}</span>
      </div>
    );

    if (k === "1a-lifestyle") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          <ImgFill image={image} />
          {scrim}
          {chip}
          <div style={{ position: "absolute", left: `${FEED_PAD}px`, right: `${FEED_PAD}px`, bottom: `${FEED_PAD}px` }}>
            {txt(f.kicker) ? (
              <div style={mn(8, { color: accText, marginBottom: "8px", ...overImage() })}>{txt(f.kicker)}</div>
            ) : null}
            <h2 style={sf(30, 800, { margin: 0, lineHeight: 1, color: "#f7f2e6", ...overImage() })}>
              {txt(f.headline)}
            </h2>
          </div>
        </SlideRoot>
      );
    }
    if (k === "1d-photoquote") {
      return (
        <SlideRoot w={w} h={h} g={g}>
          <ImgFill image={image} />
          {scrim}
          {chip}
          <div style={{ position: "absolute", left: `${FEED_PAD}px`, right: `${FEED_PAD}px`, bottom: `${FEED_PAD}px` }}>
            <div style={sf(60, 800, { lineHeight: 0.5, height: "28px", color: accMark, ...overImage() })}>
              &ldquo;
            </div>
            <h2
              style={sf(24, 700, {
                fontStyle: "italic",
                margin: 0,
                lineHeight: 1.14,
                color: "#f7f2e6",
                ...overImage(),
              })}
            >
              {txt(f.quote)}
            </h2>
            {txt(f.attribution) ? (
              <div style={sans(11, 600, { color: g.sub, marginTop: "14px", ...overImage() })}>
                {txt(f.attribution)}
              </div>
            ) : null}
          </div>
        </SlideRoot>
      );
    }
    if (k === "1b-fieldnote") {
      return (
        <SlideRoot w={w} h={h} g={g} extra={{ background: "#ece6d6", color: "#1a2230" }}>
          <div style={{ position: "absolute", inset: `${FEED_PAD}px`, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <span style={sf(12, 700, { color: "#1a2230" })}>{brand}</span>
              {txt(f.tag) ? <span style={mn(8, { color: readableOn(acc, "#ece6d6") })}>{txt(f.tag)}</span> : null}
            </div>
            <div
              style={{
                flex: 1,
                borderRadius: "12px",
                overflow: "hidden",
                position: "relative",
                border: image ? "none" : "3px dashed rgba(26,34,48,.24)",
                background: "#e0dac9",
              }}
            >
              <ImgFill image={image} />
            </div>
            <div style={{ marginTop: "12px" }}>
              <div style={sf(19, 700, { color: "#1a2230", lineHeight: 1.06 })}>{txt(f.caption)}</div>
              {txt(f.captionSub) ? (
                <div style={sans(11.5, 400, { color: "#4a4636", marginTop: "5px", lineHeight: 1.4 })}>
                  {txt(f.captionSub)}
                </div>
              ) : null}
            </div>
          </div>
        </SlideRoot>
      );
    }
    if (k === "1c-split") {
      return (
        <SlideRoot w={w} h={h} g={g} extra={{ background: "#ece6d6", color: "#1a2230" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1.2, position: "relative", overflow: "hidden", background: "#e0dac9" }}>
              <ImgFill image={image} />
            </div>
            <div
              style={{
                flex: 1,
                padding: `${FEED_PAD}px`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {txt(f.kicker) ? (
                <div style={mn(8, { color: readableOn(acc, "#ece6d6"), marginBottom: "8px" })}>{txt(f.kicker)}</div>
              ) : null}
              <h2 style={sf(24, 700, { margin: 0, lineHeight: 1.04, color: "#1a2230" })}>{txt(f.headline)}</h2>
              {txt(f.body) ? (
                <p style={sans(12, 400, { margin: "10px 0 0", color: "#4a4636", lineHeight: 1.42, maxWidth: "26ch" })}>
                  {txt(f.body)}
                </p>
              ) : null}
            </div>
          </div>
        </SlideRoot>
      );
    }
  }

  // Fallback — an unknown kind still renders something legible rather than blank.
  return (
    <SlideRoot w={w} h={h} g={g}>
      <SlideInset inset={inset}>
        {cHdr}
        <div style={{ margin: "auto 0", ...sf(24, 700) }}>
          {txt(f.hook) || txt(f.headline) || txt(f.prompt)}
        </div>
      </SlideInset>
    </SlideRoot>
  );
}
