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
 */

import type { CSSProperties, ReactNode } from "react";
import { getManifest } from "@/lib/templates/manifests";
import { FONTS, ground, safeOn } from "@/lib/templates/theme";
import type { ImageValue, PairItem, QuizOption, SlideDoc, TemplateStyleId } from "@/lib/templates/types";
import { isImageValue, isPairItems, isQuizOptions, isStringList } from "@/lib/templates/types";

export interface SlideContext {
  style: TemplateStyleId;
  accent: string;
  brand: string;
  handle: string;
  /** Monogram shown in reel/story/photo brand chips. */
  initials: string;
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

const p2 = (n: number) => String(n).padStart(2, "0");

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
  const pad = style === "reel" || style === "story" ? 18 : 26;
  const counter = `${p2(index + 1)}/${p2(total)}`;
  const k = slide.kind;

  const Root = ({ children, extra }: { children: ReactNode; extra?: CSSProperties }) => (
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

  const Inset = ({ children }: { children: ReactNode }) => (
    <div style={{ position: "absolute", inset: `${pad}px`, display: "flex", flexDirection: "column" }}>{children}</div>
  );

  const cHdr = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={sf(11, 700)}>{brand}</span>
      <span style={mn(8, { color: g.sub ?? "rgba(244,239,224,.7)" })}>{counter}</span>
    </div>
  );

  const bar = (pct: string) => (
    <div style={{ height: "3px", borderRadius: "999px", background: "rgba(26,34,48,.12)", marginTop: "7px" }}>
      <div style={{ height: "100%", width: pct, background: acc, borderRadius: "999px" }} />
    </div>
  );

  const swipe = (
    <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", paddingTop: "8px" }}>
      <span style={sans(9, 600, { color: g.sub ?? "#6e6952" })}>Swipe →</span>
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
      <Root>
        <Inset>
          {cHdr}
          <div style={{ marginTop: "auto" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "10px" })}>{txt(f.kicker)}</div> : null}
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
        </Inset>
      </Root>
    );
  }

  if (k === "1b-editorial") {
    return (
      <Root>
        <Inset>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderBottom: "2px solid #1a2230",
              paddingBottom: "7px",
            }}
          >
            <span style={mn(8, { color: acc })}>{txt(f.kicker)}</span>
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
        </Inset>
      </Root>
    );
  }

  if (k === "1c-bigstat" || k === "1a-stat") {
    const ac = safeOn(acc, g.base);
    return (
      <Root>
        <Inset>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={mn(8, { color: ac })}>{txt(f.kicker)}</span>
            <span style={mn(8, { color: "rgba(244,239,224,.7)" })}>{style === "single" ? brand : counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            <div style={sf(94, 800, { lineHeight: 0.8, letterSpacing: "-.03em", color: ac })}>{txt(f.statValue)}</div>
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
            <span style={sans(8, 400, { color: "rgba(244,239,224,.8)" })}>
              {txt(f.source) ? `Source: ${txt(f.source)}` : ""}
            </span>
            <span style={sf(10, 700)}>{brand}</span>
          </div>
        </Inset>
      </Root>
    );
  }

  if (k === "1d-quote" || (style === "single" && k === "1b-quote")) {
    const ac = safeOn(acc, g.base);
    return (
      <Root>
        <Inset>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={mn(8, { color: ac })}>{txt(f.kicker)}</span>
            <span style={mn(8, { color: "rgba(244,239,224,.7)" })}>{style === "single" ? brand : counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            <div style={sf(72, 800, { lineHeight: 0.5, height: "34px", color: ac })}>&ldquo;</div>
            <h2 style={sf(26, 700, { fontStyle: "italic", margin: 0, lineHeight: 1.14 })}>{txt(f.quote)}</h2>
            {txt(f.attribution) ? (
              <div style={sans(11, 600, { color: "rgba(244,239,224,.82)", marginTop: "16px" })}>
                {txt(f.attribution)}
              </div>
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
            <span style={sans(9, 600, { color: "rgba(244,239,224,.85)" })}>Swipe →</span>
          </div>
        </Inset>
      </Root>
    );
  }

  if (k === "2a-point") {
    return (
      <Root>
        <Inset>
          {cHdr}
          {bar("43%")}
          <div style={{ margin: "auto 0" }}>
            <div style={sf(46, 800, { lineHeight: 0.8, color: acc })}>{txt(f.index)}</div>
            {txt(f.label) ? <div style={mn(8, { color: g.sub, margin: "12px 0 6px" })}>{txt(f.label)}</div> : null}
            <h2 style={sf(24, 700, { margin: 0, lineHeight: 1.04 })}>{txt(f.heading)}</h2>
            {txt(f.body) ? (
              <p style={sans(11, 400, { margin: "10px 0 0", lineHeight: 1.42, color: g.sub, maxWidth: "26ch" })}>
                {txt(f.body)}
              </p>
            ) : null}
          </div>
          {swipe}
        </Inset>
      </Root>
    );
  }

  if (k === "2b-stat") {
    return (
      <Root>
        <Inset>
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
            {txt(f.label) ? <div style={mn(8, { color: acc, marginBottom: "8px" })}>{txt(f.label)}</div> : null}
            <div style={sf(60, 800, { lineHeight: 0.82, letterSpacing: "-.02em" })}>{txt(f.statValue)}</div>
            <h2 style={sf(19, 600, { margin: "12px 0 0", lineHeight: 1.1, maxWidth: "18ch" })}>{txt(f.statLine)}</h2>
          </div>
          {swipe}
        </Inset>
      </Root>
    );
  }

  if (k === "2c-list") {
    return (
      <Root>
        <Inset>
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
                    color: "#fff",
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
        </Inset>
      </Root>
    );
  }

  if (k === "2d-image") {
    const image = img(f.image);
    return (
      <Root>
        <Inset>
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
        </Inset>
      </Root>
    );
  }

  if (k === "2e-myth" || (style === "single" && k === "1c-myth")) {
    return (
      <Root>
        <Inset>
          {style === "single" ? <div style={mn(8, { color: acc })}>Myth vs fact</div> : cHdr}
          {style === "single" ? null : bar("57%")}
          <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#e0dac9", borderRadius: "14px", padding: "16px 18px" }}>
              <div style={mn(8, { color: "#8a8672", marginBottom: "6px" })}>Myth</div>
              <div
                style={sf(18, 600, {
                  lineHeight: 1.08,
                  color: "#6e6952",
                  textDecoration: "line-through",
                  textDecorationThickness: "2px",
                })}
              >
                {txt(f.myth)}
              </div>
            </div>
            <div style={{ background: acc, borderRadius: "14px", padding: "16px 18px", color: "#fff" }}>
              <div style={mn(8, { opacity: 0.85, marginBottom: "6px" })}>Fact</div>
              <div style={sf(20, 700, { lineHeight: 1.06 })}>{txt(f.fact)}</div>
            </div>
          </div>
          {style === "single" ? (
            <div style={{ marginTop: "auto", ...sf(10, 700), color: acc }}>{brand}</div>
          ) : (
            swipe
          )}
        </Inset>
      </Root>
    );
  }

  if (k === "2f-cta" || k === "1f-cta") {
    const recap = strings(f.recap);
    return (
      <Root>
        <Inset>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={sf(11, 700)}>{brand}</span>
            <span style={mn(8, { color: acc })}>{counter}</span>
          </div>
          <div style={{ margin: "auto 0" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "10px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(30, 800, { margin: "0 0 14px", lineHeight: 0.98, maxWidth: "15ch" })}>{txt(f.hook)}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {recap.map((r, j) => (
                <div key={j} style={{ display: "flex", gap: "9px", alignItems: "center", ...sans(12, 500) }}>
                  <span style={{ color: acc, fontSize: "14px" }}>✓</span>
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
            <span style={sans(10, 600)}>{txt(f.followLine) || `Follow ${handle}`}</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: acc,
                color: "#141a24",
                ...sans(11, 700),
                padding: "8px 12px",
                borderRadius: "999px",
              }}
            >
              Save ⤓
            </span>
          </div>
        </Inset>
      </Root>
    );
  }

  // ── REEL ──────────────────────────────────────────────────────────────────
  const brandChip = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(20,26,36,.5)",
        borderRadius: "999px",
        padding: "4px 10px 4px 5px",
      }}
    >
      <span
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "5px",
          background: acc,
          color: "#141a24",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...sf(8, 800),
        }}
      >
        {ctx.initials}
      </span>
      <span style={sans(9, 700, { color: "#f4efe0" })}>{brand}</span>
    </div>
  );

  const ticks = (active: number) => (
    <div style={{ position: "absolute", top: "16px", left: `${pad}px`, right: `${pad}px`, display: "flex", gap: "5px" }}>
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
    const scrim = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg,rgba(10,12,16,.5) 0%,rgba(10,12,16,.12) 40%,rgba(10,12,16,.72) 100%)",
        }}
      />
    );
    const chipAt = (
      <div style={{ position: "absolute", left: `${pad}px`, top: "34px" }}>{brandChip}</div>
    );

    if (k === "1a-statement") {
      return (
        <Root>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div style={{ position: "absolute", left: `${pad}px`, right: "44px", top: "150px" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "8px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(30, 800, { margin: 0, lineHeight: 1, color: "#f4efe0" })}>{txt(f.hook)}</h2>
          </div>
        </Root>
      );
    }
    if (k === "1b-question") {
      return (
        <Root>
          {ticks(index)}
          {chipAt}
          <div style={{ position: "absolute", left: `${pad}px`, right: "36px", top: "150px" }}>
            <h2 style={sf(30, 800, { margin: 0, lineHeight: 1.02 })}>{txt(f.hook)}</h2>
            {txt(f.sub) ? (
              <p style={sans(13, 600, { margin: "14px 0 0", color: "rgba(244,239,224,.85)" })}>{txt(f.sub)}</p>
            ) : null}
          </div>
        </Root>
      );
    }
    if (k === "1c-kinetic") {
      return (
        <Root>
          {ticks(index)}
          {chipAt}
          <div style={{ position: "absolute", left: `${pad}px`, right: "36px", top: "150px" }}>
            {txt(f.preWord) ? (
              <div style={sans(14, 600, { color: acc, marginBottom: "2px" })}>{txt(f.preWord)}</div>
            ) : null}
            <div style={sf(56, 800, { lineHeight: 0.92, letterSpacing: "-.02em" })}>{txt(f.bigWord)}</div>
            {txt(f.sub) ? (
              <div style={sans(13, 600, { marginTop: "12px", color: "rgba(244,239,224,.85)" })}>{txt(f.sub)}</div>
            ) : null}
          </div>
        </Root>
      );
    }
    if (k === "1d-title") {
      return (
        <Root>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div style={{ position: "absolute", left: `${pad}px`, right: "40px", top: "190px" }}>
            {txt(f.kicker) ? <div style={mn(7, { color: acc, marginBottom: "8px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(26, 800, { margin: 0, lineHeight: 1.04, color: "#f4efe0" })}>{txt(f.title)}</h2>
            {txt(f.sub) ? (
              <p style={sans(12, 600, { margin: "10px 0 0", color: "rgba(244,239,224,.85)" })}>{txt(f.sub)}</p>
            ) : null}
          </div>
        </Root>
      );
    }
    if (k === "1e-caption") {
      return (
        <Root>
          <ImgFill image={img(f.image)} />
          {scrim}
          {ticks(index)}
          {chipAt}
          <div
            style={{
              position: "absolute",
              left: `${pad}px`,
              right: `${pad}px`,
              bottom: "150px",
              background: "rgba(20,26,36,.62)",
              borderRadius: "12px",
              padding: "12px 14px",
            }}
          >
            <div style={sans(15, 700, { lineHeight: 1.28, color: "#f4efe0" })}>{txt(f.caption)}</div>
          </div>
        </Root>
      );
    }
  }

  // ── STORY ─────────────────────────────────────────────────────────────────
  if (style === "story") {
    const image = img(f.image);
    const segs = (
      <div style={{ position: "absolute", top: "14px", left: "16px", right: "16px", display: "flex", gap: "5px" }}>
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
      <div style={{ position: "absolute", top: "26px", left: "16px", display: "flex", alignItems: "center", gap: "7px" }}>
        <span
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "6px",
            background: acc,
            color: "#141a24",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...sf(9, 800),
          }}
        >
          {ctx.initials}
        </span>
        <span style={sans(10, 700, { color: "#fff" })}>{brand}</span>
      </div>
    );
    const Wrap = ({ children }: { children: ReactNode }) => (
      <Root extra={{ background: image?.url || image?.tint ? undefined : g.bg }}>
        {image ? <ImgFill image={image} /> : null}
        {segs}
        {topbar}
        {children}
      </Root>
    );

    if (k === "1a-poll") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "150px" }}>
            {txt(f.kicker) ? (
              <div style={mn(8, { color: safeOn(acc, g.base), marginBottom: "10px" })}>{txt(f.kicker)}</div>
            ) : null}
            <h2 style={sf(28, 800, { margin: "0 0 20px", lineHeight: 1, color: "#f4efe0" })}>{txt(f.prompt)}</h2>
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "6px",
                boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              }}
            >
              <div style={sans(15, 700, { textAlign: "center", color: "#1a2230", padding: "11px 0" })}>
                {txt(f.optionA)}
              </div>
              <div style={{ height: "1.5px", background: "rgba(26,34,48,.12)" }} />
              <div style={sans(15, 700, { textAlign: "center", color: "#1a2230", padding: "11px 0" })}>
                {txt(f.optionB)}
              </div>
            </div>
          </div>
        </Wrap>
      );
    }
    if (k === "1b-question") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "170px" }}>
            <h2 style={sf(28, 800, { margin: "0 0 18px", lineHeight: 1.02, color: "#f4efe0" })}>{txt(f.prompt)}</h2>
            <div
              style={{
                background: "#fff",
                borderRadius: "14px",
                padding: "16px 16px 20px",
                boxShadow: "0 12px 30px rgba(0,0,0,.3)",
              }}
            >
              <div style={sans(13, 700, { color: "#1a2230", marginBottom: "12px" })}>{txt(f.stickerLabel)}</div>
              <div style={{ height: "34px", borderRadius: "9px", background: "#eee7d7" }} />
            </div>
          </div>
        </Wrap>
      );
    }
    if (k === "1c-quiz") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "160px" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "10px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(26, 800, { margin: "0 0 18px", lineHeight: 1.04, color: "#f4efe0" })}>{txt(f.prompt)}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {quiz(f.options).map((o, j) => (
                <div
                  key={j}
                  style={{
                    background: o.correct ? acc : "#fff",
                    color: o.correct ? "#fff" : "#1a2230",
                    borderRadius: "11px",
                    padding: "12px 14px",
                    ...sans(14, 700),
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
          </div>
        </Wrap>
      );
    }
    if (k === "1d-slider") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "190px" }}>
            <h2 style={sf(26, 800, { margin: "0 0 20px", lineHeight: 1.04, color: "#f4efe0" })}>{txt(f.prompt)}</h2>
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
          </div>
        </Wrap>
      );
    }
    if (k === "1e-countdown") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "160px" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "10px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(26, 800, { margin: "0 0 18px", lineHeight: 1.04, color: "#f4efe0" })}>{txt(f.headline)}</h2>
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
              <div style={{ ...mn(8), color: "rgba(255,255,255,.75)", marginBottom: "6px" }}>{txt(f.targetTime)}</div>
              <div style={sf(24, 800, { color: "#fff" })}>06 : 12 : 40</div>
            </div>
            <div
              style={{
                background: acc,
                color: "#141a24",
                borderRadius: "999px",
                padding: "11px",
                textAlign: "center",
                ...sans(13, 700),
              }}
            >
              {txt(f.linkLabel)}
            </div>
          </div>
        </Wrap>
      );
    }
    if (k === "1f-reshare") {
      return (
        <Wrap>
          <div style={{ position: "absolute", left: "22px", right: "22px", top: "170px" }}>
            {txt(f.flag) ? (
              <div
                style={{
                  display: "inline-block",
                  background: acc,
                  color: "#141a24",
                  ...sans(11, 700),
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
                <span style={sans(11, 700, { color: "#1a2230" })}>{handle}</span>
              </div>
              <div
                style={{
                  aspectRatio: "4/5",
                  borderRadius: "9px",
                  background: "linear-gradient(150deg,#3b5a78,#5c7556)",
                }}
              />
            </div>
          </div>
        </Wrap>
      );
    }
  }

  // ── SINGLE announcement ───────────────────────────────────────────────────
  if (k === "1d-announce") {
    return (
      <Root>
        <Inset>
          {txt(f.pill) ? (
            <div
              style={{
                display: "inline-block",
                alignSelf: "flex-start",
                background: acc,
                color: "#141a24",
                ...sans(11, 800),
                padding: "5px 12px",
                borderRadius: "999px",
              }}
            >
              {txt(f.pill)}
            </div>
          ) : null}
          <div style={{ margin: "auto 0" }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "10px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(34, 800, { margin: 0, lineHeight: 0.98, letterSpacing: "-.01em" })}>{txt(f.headline)}</h2>
            {txt(f.sub) ? (
              <p style={sans(13, 600, { margin: "14px 0 0", color: "rgba(244,239,224,.85)", maxWidth: "24ch" })}>
                {txt(f.sub)}
              </p>
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
        </Inset>
      </Root>
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
          top: `${pad}px`,
          left: `${pad}px`,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(20,26,36,.42)",
          borderRadius: "999px",
          padding: "4px 11px 4px 5px",
        }}
      >
        <span
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "5px",
            background: acc,
            color: "#141a24",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...sf(8, 800),
          }}
        >
          {ctx.initials}
        </span>
        <span style={sans(9, 700, { color: "#f4efe0" })}>{brand}</span>
      </div>
    );

    if (k === "1a-lifestyle") {
      return (
        <Root>
          <ImgFill image={image} />
          {scrim}
          {chip}
          <div style={{ position: "absolute", left: `${pad}px`, right: `${pad}px`, bottom: `${pad}px` }}>
            {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "8px" })}>{txt(f.kicker)}</div> : null}
            <h2 style={sf(30, 800, { margin: 0, lineHeight: 1, color: "#f7f2e6" })}>{txt(f.headline)}</h2>
          </div>
        </Root>
      );
    }
    if (k === "1d-photoquote") {
      return (
        <Root>
          <ImgFill image={image} />
          {scrim}
          {chip}
          <div style={{ position: "absolute", left: `${pad}px`, right: `${pad}px`, bottom: `${pad}px` }}>
            <div style={sf(60, 800, { lineHeight: 0.5, height: "28px", color: acc })}>&ldquo;</div>
            <h2 style={sf(24, 700, { fontStyle: "italic", margin: 0, lineHeight: 1.14, color: "#f7f2e6" })}>
              {txt(f.quote)}
            </h2>
            {txt(f.attribution) ? (
              <div style={sans(11, 600, { color: "rgba(247,242,230,.85)", marginTop: "14px" })}>
                {txt(f.attribution)}
              </div>
            ) : null}
          </div>
        </Root>
      );
    }
    if (k === "1b-fieldnote") {
      return (
        <Root extra={{ background: "#ece6d6", color: "#1a2230" }}>
          <div style={{ position: "absolute", inset: `${pad}px`, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <span style={sf(12, 700, { color: "#1a2230" })}>{brand}</span>
              {txt(f.tag) ? <span style={mn(8, { color: acc })}>{txt(f.tag)}</span> : null}
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
        </Root>
      );
    }
    if (k === "1c-split") {
      return (
        <Root extra={{ background: "#ece6d6", color: "#1a2230" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1.2, position: "relative", overflow: "hidden", background: "#e0dac9" }}>
              <ImgFill image={image} />
            </div>
            <div
              style={{
                flex: 1,
                padding: `${pad}px`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {txt(f.kicker) ? <div style={mn(8, { color: acc, marginBottom: "8px" })}>{txt(f.kicker)}</div> : null}
              <h2 style={sf(24, 700, { margin: 0, lineHeight: 1.04, color: "#1a2230" })}>{txt(f.headline)}</h2>
              {txt(f.body) ? (
                <p style={sans(12, 400, { margin: "10px 0 0", color: "#4a4636", lineHeight: 1.42, maxWidth: "26ch" })}>
                  {txt(f.body)}
                </p>
              ) : null}
            </div>
          </div>
        </Root>
      );
    }
  }

  // Fallback — an unknown kind still renders something legible rather than blank.
  return (
    <Root>
      <Inset>
        {cHdr}
        <div style={{ margin: "auto 0", ...sf(24, 700) }}>
          {txt(f.hook) || txt(f.headline) || txt(f.prompt)}
        </div>
      </Inset>
    </Root>
  );
}
