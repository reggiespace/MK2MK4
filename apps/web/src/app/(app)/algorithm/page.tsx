import { Icon } from "@/components/ui/Icon";
import {
  FORMATS,
  HOOKS,
  MANDATE,
  SIGNALS,
  SOURCES,
  SURFACES,
} from "@/lib/algorithm-report";
import { display, kicker } from "@/components/create/styles";

/**
 * The grounding document, in-app.
 *
 * Every rule here is already encoded somewhere in the system — in a manifest's
 * slot budgets, the renderer's safe zones, or the generation prompts. The page
 * exists so the constraints read as decisions rather than arbitrary limits.
 */

const SIGNAL_COLOR: Record<string, string> = {
  accent: "var(--moss)",
  secondary: "var(--slate)",
  muted: "var(--border-2)",
};

export default function AlgorithmPage() {
  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "32px 40px 80px" }}>
      {/* ── Masthead ── */}
      <header style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "20px", marginBottom: "40px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "24px",
          }}
        >
          <span style={display(15, 700)}>
            Reggie<span style={{ color: "var(--moss)" }}>Space</span> · Field Research
          </span>
          <span style={{ ...kicker, fontSize: "11px" }}>Social templates · Briefing No. 01 · July 2026</span>
        </div>
        <hr style={{ height: "4px", width: "64px", borderRadius: "999px", background: "var(--accent)", border: 0, margin: "0 0 18px" }} />
        <h1 style={display(56, 700, { lineHeight: 0.98, letterSpacing: "-.02em", margin: "0 0 14px", maxWidth: "16ch" })}>
          Built for the Scroll
        </h1>
        <p style={{ fontSize: "19px", lineHeight: 1.5, color: "var(--muted)", maxWidth: "60ch", margin: 0 }}>
          How Instagram actually ranks Reels, carousels and Stories in 2026 — and the design decisions that turn a
          template into reach. A working brief for the people (and models) filling these surfaces.
        </p>
      </header>

      {/* ── Bottom line + signal stack ── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)",
          gap: "36px",
          alignItems: "start",
          marginBottom: "44px",
        }}
      >
        <div>
          <div style={{ ...kicker, marginBottom: "12px" }}>The bottom line</div>
          <p style={{ fontSize: "16.5px", lineHeight: 1.62, marginTop: 0 }}>
            There is no single Instagram algorithm. Meta runs four separate ranking systems — Feed, Reels, Stories and
            Explore — and each optimises for a different question about the viewer. A template that wins on Reels is
            not the one that wins in Feed. But one shift cuts across all of them:{" "}
            <strong>private sharing now outranks public applause.</strong> Sends are described as one of the biggest
            signals in ranking, and the loudest positive vote the system has.
          </p>
          <p style={{ fontSize: "16.5px", lineHeight: 1.62 }}>
            Saves and sends read as high-intent proof of value; watch-through decides whether video travels at all;
            likes have quietly become the weakest signal still reported. Every template in this system is engineered to
            earn a save, provoke a send, or hold a watch — not to collect likes.
          </p>
        </div>

        <aside style={{ background: "var(--surface)", borderRadius: "16px", padding: "24px", border: "1px solid var(--border)" }}>
          <div style={{ ...kicker, marginBottom: "16px" }}>The 2026 signal stack</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
            {SIGNALS.map((s) => (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
                  <span style={{ fontWeight: 700, fontSize: "13.5px" }}>{s.label}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)" }}>{s.note}</span>
                </div>
                <div style={{ height: "12px", borderRadius: "999px", background: "#e5ddc6", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: "999px",
                      width: `${s.weight}%`,
                      background: SIGNAL_COLOR[s.tone],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "11px", lineHeight: 1.45, margin: "18px 0 0", color: "var(--muted)" }}>
            Relative weighting synthesised from the stated hierarchy and third-party analytics — not published
            percentages. Order, not exact magnitude, is the point.
          </p>
        </aside>
      </section>

      {/* ── Four surfaces ── */}
      <section style={{ marginBottom: "44px" }}>
        <h2 style={display(26, 700, { margin: "0 0 8px" })}>Four rooms, four questions</h2>
        <p style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: "22px", fontSize: "14.5px" }}>
          Each surface asks something different before it shows your post to one more person. Design the format to
          answer <em>its</em> question.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
          {SURFACES.map((s) => (
            <div
              key={s.name}
              style={{ background: "var(--surface)", borderRadius: "16px", padding: "22px", border: "1px solid var(--border)" }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg,#3b5a78,#5c7556)",
                  color: "#f4efe0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...display(19, 800),
                  marginBottom: "12px",
                }}
              >
                {s.mark}
              </div>
              <h4 style={display(16, 700, { margin: "0 0 4px" })}>{s.name}</h4>
              <p style={{ fontSize: "14px", fontStyle: "italic", color: "var(--moss)", margin: "0 0 8px" }}>
                &ldquo;{s.question}&rdquo;
              </p>
              <p style={{ fontSize: "13.5px", lineHeight: 1.5, margin: 0, color: "var(--muted)" }}>{s.signal}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Per-format briefs ── */}
      {FORMATS.map((fmt) => (
        <section key={fmt.id} style={{ marginBottom: "44px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
            <span
              style={{
                ...display(14, 700),
                color: "#fff",
                background: "var(--moss)",
                padding: "4px 14px",
                borderRadius: "999px",
              }}
            >
              {fmt.index}
            </span>
            <h2 style={display(26, 700, { margin: 0 })}>{fmt.title}</h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: fmt.stats.length ? "minmax(0,1.5fr) minmax(0,1fr)" : "1fr",
              gap: "32px",
              alignItems: "start",
            }}
          >
            <div>
              {fmt.paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: "16px", lineHeight: 1.62, marginTop: i === 0 ? 0 : undefined }}>
                  {p}
                </p>
              ))}
            </div>

            {fmt.stats.length ? (
              <aside style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px" }}>
                {fmt.stats.map((stat, i) => (
                  <div key={stat.value} style={{ marginTop: i ? "22px" : 0 }}>
                    <div style={display(46, 800, { lineHeight: 0.9, color: "var(--moss)" })}>{stat.value}</div>
                    <p style={{ fontSize: "14px", fontWeight: 600, margin: "8px 0 0" }}>{stat.caption}</p>
                  </div>
                ))}
              </aside>
            ) : null}
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "22px 24px",
              marginTop: "20px",
            }}
          >
            <div style={{ ...kicker, marginBottom: "14px" }}>What the templates lock in</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "16px" }}>
              {fmt.rules.map((r) => (
                <div key={r.title} style={{ fontSize: "13.5px", lineHeight: 1.5 }}>
                  <strong>{r.title}.</strong> {r.body}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* ── Hook library ── */}
      <section style={{ marginBottom: "44px" }}>
        <h2 style={display(26, 700, { margin: "0 0 8px" })}>The hook is the product</h2>
        <p style={{ color: "var(--muted)", maxWidth: "66ch", marginBottom: "22px", fontSize: "14.5px" }}>
          Across Reels, covers and Story openers the mechanic is identical: open a curiosity gap the viewer must close.
          Spoken or written, a hook should land in the first three seconds — roughly 10–14 words — and deliver on its
          promise, or completion (and reach) collapses.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "12px" }}>
          {HOOKS.map((h) => (
            <div
              key={h.name}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${h.topTier ? "var(--accent)" : "var(--border-2)"}`,
                borderRadius: "12px",
                padding: "14px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                <span style={display(13, 700, { color: "var(--moss)" })}>{h.name}</span>
                {h.topTier ? (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8.5px",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      background: "var(--ok-bg)",
                      color: "var(--ok-fg)",
                      padding: "2px 6px",
                      borderRadius: "999px",
                    }}
                  >
                    Top tier
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: "14.5px", fontWeight: 600, fontStyle: "italic" }}>&ldquo;{h.example}&rdquo;</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "12.5px", marginTop: "12px", color: "var(--muted)" }}>
          Contrarian claim, mistake warning and list tease are the three most consistently viral formulas in 2026 — but
          top creators rotate five to ten so audiences don&rsquo;t learn to skip the opener.
        </p>
      </section>

      {/* ── Mandate ── */}
      <section
        style={{
          background: "linear-gradient(150deg,#3b5a78,#5c7556)",
          borderRadius: "20px",
          padding: "34px",
          marginBottom: "44px",
          color: "#f4efe0",
        }}
      >
        <div style={{ ...kicker, color: "rgba(244,239,224,.75)", marginBottom: "8px" }}>
          What this means for our templates
        </div>
        <h2 style={display(26, 700, { color: "#fff", margin: "0 0 24px", maxWidth: "22ch" })}>
          Nine rules baked into every surface we ship
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: "22px" }}>
          {MANDATE.map((rule, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ ...display(22, 800), color: "rgba(244,239,224,.6)", lineHeight: 1 }}>{i + 1}</span>
              <p style={{ fontSize: "14px", lineHeight: 1.5, margin: 0, opacity: 0.95 }}>{rule}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sources ── */}
      <section>
        <h2 style={display(26, 700, { margin: "0 0 8px" })}>Sources</h2>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "22px",
            maxWidth: "72ch",
          }}
        >
          <span style={{ display: "flex", color: "var(--brass)", marginTop: "1px" }}>
            <Icon name="info" size={16} strokeWidth={2.2} />
          </span>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.6 }}>
            Secondary analyses and platform-statement round-ups, July 2026. Load-bearing figures — signal order, the
            three-second gate, safe-zone pixels, carousel re-serve — were cross-checked across independent sources;
            where guides disagreed, the more recent and more conservative figure was taken. Platform behaviour changes;
            re-check before treating any number here as current.
          </p>
        </div>
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: "2px 32px",
          }}
        >
          {SOURCES.map((s) => (
            <li
              key={`${s.n}-${s.publisher}`}
              style={{
                display: "flex",
                gap: "12px",
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: "13px",
                lineHeight: 1.4,
              }}
            >
              <span style={{ ...display(13, 700), color: "var(--moss)", minWidth: "22px" }}>{s.n}</span>
              <span>
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
                  {s.publisher}
                </a>
                <span style={{ color: "var(--muted)" }}> — {s.title}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
