import { Icon } from "@/components/ui/Icon";
import { display, kicker } from "@/components/create/styles";

/**
 * The algorithm report — the grounding doc the templates were designed
 * against. Static reference material, deliberately not generated: the rules
 * here are what the manifests already encode, so a reader can see why a
 * template is shaped the way it is.
 */

const SIGNALS = [
  { label: "Sends / DM shares", note: "strongest", w: "100%", strong: true },
  { label: "Saves", note: "high intent", w: "82%", strong: true },
  { label: "Watch time / completion", note: "gates video", w: "90%", strong: false },
  { label: "Comments (depth)", note: "moderate", w: "55%", strong: false },
  { label: "Likes", note: "weakest reported", w: "28%", strong: false },
];

const SURFACES = [
  {
    mark: "F",
    name: "Feed & Carousel",
    q: "Would this person care?",
    signal: "Saves, sends and — rising fast — profile-visit rate. Relationship plus high-intent actions.",
  },
  {
    mark: "R",
    name: "Reels",
    q: "Would they watch it all the way through?",
    signal: "Watch time first; sends per reach for new audiences. Retention is everything.",
  },
  {
    mark: "S",
    name: "Stories",
    q: "Do these two people actually talk?",
    signal: "Viewing history and replies. A relationship signal, not a discovery channel.",
  },
  {
    mark: "E",
    name: "Explore",
    q: "Is this good enough for a stranger?",
    signal: "Early engagement velocity and interest-match; follower count barely matters.",
  },
];

const HOOKS = [
  { name: "Contrarian claim", ex: "Everything you've been told about protein timing is backwards." },
  { name: "Mistake warning", ex: "The one carousel mistake quietly killing your reach." },
  { name: "List tease", ex: "5 shifts that saved me 10 hours a week (#3 surprised me)." },
  { name: "Open question", ex: "Why do some posts hit 200K while yours die at 2K?" },
  { name: "Callout", ex: "Most people get this wrong about their fade days." },
  { name: "Reveal / POV", ex: "Here's what nobody tells you about week three." },
];

const MANDATE = [
  "One hook, largest element. Every cover and title frame carries a 5–8 word curiosity gap as the biggest text on the surface.",
  'Design to be saved and sent. Build a reference-worthy end slide and "send this to someone who…" moments into the layout, not the caption.',
  "Respect the 9:16 safe zone. Lock a centered ≈900×1440 content box; keep the bottom 480px and right 120px clear of anything that matters.",
  "Slide 2 is a second cover. Make it independently compelling — the re-serve mechanic may show it first.",
  "Front-load the payoff. Strongest point by slide 3; never bury it on slide 7.",
  "Type that survives thumbnails. Display face for hooks at heavy weight; body at or above platform-safe size at 4.5:1 contrast; dark stroke over imagery.",
  "Three colors, 60-30-10, one display plus one body pairing. Visual consistency across every slide of a set.",
  "Motion and voice ready. Reel frames assume on-screen text is the narration script over a generated background; a directional cue points to what is next.",
  "A sticker zone on Stories. Reserve a tap target for a poll or question on frame one — the template invites interaction by default.",
];

export default function AlgorithmPage() {
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "34px" }}>
      <div>
        <div style={{ ...kicker, marginBottom: "6px" }}>Grounding doc</div>
        <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1 })}>What the algorithm rewards</h1>
        <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: "14.5px", lineHeight: 1.6, maxWidth: "60ch" }}>
          The reasoning behind the template system. Every rule below is already baked into the manifests — this page
          exists so the constraints read as decisions rather than arbitrary limits.
        </p>
      </div>

      <section>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Ranking signals, in order</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "14px" }}>
          Sends outrank saves, saves outrank comments, comments outrank likes. This is why the end slide asks for a
          save and never for a download.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {SIGNALS.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ width: "190px", flexShrink: 0, fontSize: "13.5px", fontWeight: 600 }}>{s.label}</span>
              <div style={{ flex: 1, height: "10px", borderRadius: "999px", background: "#e5ddc6", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: s.w,
                    borderRadius: "999px",
                    background: s.strong ? "var(--moss)" : "var(--slate)",
                  }}
                />
              </div>
              <span
                style={{
                  width: "130px",
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--muted)",
                  textAlign: "right",
                }}
              >
                {s.note}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>Four rooms, four questions</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "14px" }}>
          Each surface ranks against a different question, which is why one post style cannot serve all of them.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "14px" }}>
          {SURFACES.map((s) => (
            <div
              key={s.name}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "9px",
                    background: "linear-gradient(135deg,#3b5a78,#5c7556)",
                    color: "#f4efe0",
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.mark}
                </span>
                <span style={display(16, 700)}>{s.name}</span>
              </div>
              <div style={display(15, 600, { fontStyle: "italic", marginBottom: "8px", lineHeight: 1.3 })}>
                &ldquo;{s.q}&rdquo;
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.55 }}>{s.signal}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={display(22, 700, { margin: "0 0 4px" })}>The hook is the product</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "14px" }}>
          Six shapes that reliably open a curiosity gap. The cover archetypes exist to give each of these a home.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {HOOKS.map((h) => (
            <div
              key={h.name}
              style={{
                display: "flex",
                gap: "14px",
                alignItems: "baseline",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "13px 16px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--brass)",
                  width: "150px",
                  flexShrink: 0,
                }}
              >
                {h.name}
              </span>
              <span style={{ fontSize: "14px", flex: 1, minWidth: "220px" }}>{h.ex}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          background: "linear-gradient(150deg,#3b5a78,#5c7556)",
          borderRadius: "20px",
          padding: "30px 32px",
          color: "#f4efe0",
        }}
      >
        <h2 style={display(22, 700, { margin: "0 0 18px", maxWidth: "22ch", color: "#fff" })}>
          Nine rules baked into every template
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
          {MANDATE.map((rule, i) => (
            <div key={i} style={{ display: "flex", gap: "13px", alignItems: "flex-start" }}>
              <span
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,.18)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: "14px", lineHeight: 1.6, opacity: 0.95 }}>{rule}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: "flex",
          gap: "13px",
          alignItems: "flex-start",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "16px 18px",
        }}
      >
        <span style={{ display: "flex", color: "var(--brass)", marginTop: "1px" }}>
          <Icon name="info" size={16} strokeWidth={2.2} />
        </span>
        <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.6 }}>
          Compiled from secondary analyses and platform-statement round-ups, July 2026. Load-bearing figures — signal
          order, the three-second gate, safe-zone pixels, carousel re-serve — were cross-checked across independent
          sources; where guides disagreed, the more recent and more conservative figure was taken. Platform behaviour
          changes; re-check before treating any number here as current.
        </p>
      </section>
    </div>
  );
}
