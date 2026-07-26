import { prisma } from "@/lib/db";
import { requireAuth, getSession } from "@/lib/session";
import { display, kicker } from "@/components/create/styles";
import { UploadButton } from "@/components/assets/UploadButton";

/** The asset library — uploads plus everything fal.ai and the renderer produced. */
export default async function AssetsPage(props: { searchParams: Promise<{ kind?: string }> }) {
  const { kind = "all" } = await props.searchParams;
  const auth = await requireAuth();
  const session = await getSession();

  const assets = await prisma.asset.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(kind !== "all" ? { kind: kind as "photo" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: { account: true },
  });

  const kinds = ["all", "photo", "screen", "logo", "audio", "video"] as const;

  return (
    <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "22px" }}>
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px" }}>
          <div style={{ ...kicker, marginBottom: "6px" }}>Library</div>
          <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1 })}>Assets</h1>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "14px" }}>
            Every image you generate is saved here automatically and can be reused in any template slot. Upload
            your own logo and screenshots — anything filed under Logo can be set as a brand mark in Settings.
          </p>
        </div>
        <UploadButton accountId={session.accountId ?? null} />
      </div>

      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
        {kinds.map((k) => {
          const on = k === kind;
          return (
            <a
              key={k}
              href={`/assets?kind=${k}`}
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: on ? 700 : 600,
                textTransform: "capitalize",
                border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                background: on ? "var(--ink)" : "var(--surface)",
                color: on ? "var(--surface)" : "var(--muted)",
              }}
            >
              {k}
            </a>
          );
        })}
      </div>

      {assets.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "14px" }}>
          {assets.map((a) => (
            <div
              key={a.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "14px",
                padding: "8px",
              }}
            >
              <div
                style={{
                  aspectRatio: "1/1",
                  borderRadius: "10px",
                  overflow: "hidden",
                  position: "relative",
                  border: "1px solid var(--border)",
                  background:
                    a.kind === "audio"
                      ? "linear-gradient(150deg,#3b5a78,#5c7556)"
                      : `url(${a.url}) center/cover, linear-gradient(150deg,#9c8d6b,#4b4433)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "7px",
                    left: "7px",
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
                      top: "7px",
                      right: "7px",
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
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginTop: "8px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {a.name}
              </div>
              <div style={{ fontSize: "10.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                {[a.account?.initials, a.width && a.height ? `${a.width}×${a.height}` : null, a.createdAt.toLocaleDateString()]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "52px 20px", color: "var(--muted)" }}>
          <div style={display(18, 700, { color: "var(--ink)", marginBottom: "6px" })}>Nothing here yet</div>
          <div style={{ fontSize: "14px" }}>
            Generate an image inside the Create flow and it lands in this library.
          </div>
        </div>
      )}
    </div>
  );
}
