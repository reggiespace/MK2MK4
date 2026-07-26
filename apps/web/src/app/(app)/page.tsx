import Link from "next/link";
import { prisma } from "@/lib/db";
import { Slide } from "@/components/slide/Slide";
import { SlideScaled } from "@/components/slide/SlideFrame";
import { Icon, PLATFORMS } from "@/components/ui/Icon";
import { loadWorkspaceContext } from "@/lib/workspace";
import { listIntegrationStatus } from "@/lib/integrations";
import { getManifest } from "@/lib/templates/manifests";
import { ACCOUNT_WITH_LOGO, slideCtx } from "@/lib/slide-context";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { display, kicker, statusPill } from "@/components/create/styles";

/** The dashboard: what's queued, what shipped, and what still needs connecting. */
export default async function DashboardPage() {
  const { auth, accounts } = await loadWorkspaceContext();

  const [queue, recent, integrations, latestIdea] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { post: { workspaceId: auth.workspaceId }, status: { in: ["pending", "scheduled"] } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { post: { include: { account: ACCOUNT_WITH_LOGO } }, channel: true },
    }),
    prisma.post.findMany({
      where: { workspaceId: auth.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { account: ACCOUNT_WITH_LOGO },
    }),
    listIntegrationStatus(auth.workspaceId),
    prisma.idea.findFirst({
      where: { account: { workspaceId: auth.workspaceId }, used: false },
      orderBy: { createdAt: "desc" },
      include: { account: true },
    }),
  ]);

  const counts = await prisma.post.groupBy({
    by: ["status"],
    where: { workspaceId: auth.workspaceId },
    _count: true,
  });
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  const stats = [
    { label: "Scheduled", value: countFor("scheduled"), icon: "cal", tint: "var(--info-bg)", fg: "var(--info-fg)" },
    { label: "Published", value: countFor("published"), icon: "send", tint: "var(--ok-bg)", fg: "var(--ok-fg)" },
    { label: "In review", value: countFor("review"), icon: "eye", tint: "var(--warn-bg)", fg: "var(--warn-fg)" },
    { label: "Drafts", value: countFor("draft"), icon: "layers", tint: "var(--danger-bg)", fg: "var(--danger-fg)" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "26px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...kicker, marginBottom: "6px" }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1 })}>{greeting}</h1>
        </div>
        <Link
          href="/create"
          className="hover-lift"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "9px",
            background: "var(--accent)",
            color: "#f4efe0",
            borderRadius: "12px",
            padding: "12px 20px",
            fontSize: "14.5px",
            fontWeight: 700,
            boxShadow: "0 5px 14px rgba(92,117,86,.26)",
          }}
        >
          <Icon name="sparkles" size={18} strokeWidth={2.2} />
          New post
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px" }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "17px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "11px" }}>
              <span
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "9px",
                  background: s.tint,
                  color: s.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={s.icon} size={17} strokeWidth={2.2} />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  letterSpacing: ".11em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                {s.label}
              </span>
            </div>
            <span style={display(29, 800, { lineHeight: 1 })}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) 1fr", gap: "22px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "22px", minWidth: 0 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
              <div>
                <div style={{ ...kicker, marginBottom: "4px" }}>Coming up</div>
                <h2 style={display(19, 700, { margin: 0 })}>Scheduled queue</h2>
              </div>
              <Link href="/pieces?status=scheduled" style={{ fontSize: "13px", fontWeight: 600 }}>
                Open queue →
              </Link>
            </div>
            {queue.length ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {queue.map((q, i) => (
                  <Link
                    key={q.id}
                    href={`/pieces/${q.postId}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "12px 0",
                      borderBottom: i === queue.length - 1 ? "1px solid transparent" : "1px solid var(--border)",
                      color: "inherit",
                    }}
                  >
                    <div style={{ width: "52px", flexShrink: 0, textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          letterSpacing: ".08em",
                          textTransform: "uppercase",
                          color: "var(--muted)",
                        }}
                      >
                        {q.scheduledAt.toLocaleDateString(undefined, { weekday: "short" })}
                      </div>
                      <div style={display(21, 800, { lineHeight: 1 })}>{q.scheduledAt.getDate()}</div>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {q.post.topic || getManifest(q.post.style as TemplateStyleId).label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "3px" }}>
                        <span
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "5px",
                            background: q.post.account.mark,
                            color: "#f4efe0",
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "7.5px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {q.post.account.initials}
                        </span>
                        <span style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          {q.scheduledAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ·{" "}
                          {PLATFORMS[q.channel.platform]?.name ?? q.channel.platform}
                        </span>
                      </div>
                    </div>
                    <span style={statusPill(q.status)}>{q.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--muted)" }}>
                Nothing scheduled. Create a post and approve it to fill the queue.
              </p>
            )}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
              <h2 style={display(19, 700, { margin: 0 })}>Recent pieces</h2>
              <Link href="/pieces" style={{ fontSize: "13px", fontWeight: 600 }}>
                All pieces →
              </Link>
            </div>
            {recent.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                {recent.map((post) => {
                  const doc = post.doc as unknown as PostDoc;
                  const style = post.style as TemplateStyleId;
                  const cover = doc?.slides?.[0];
                  return (
                    <Link key={post.id} href={`/pieces/${post.id}`} style={{ color: "inherit" }}>
                      <div
                        className="slide-art"
                        style={{
                          borderRadius: "12px",
                          overflow: "hidden",
                          position: "relative",
                          border: "1px solid var(--border)",
                          background: "var(--ink)",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        {cover ? (
                          <SlideScaled style={style} width={140}>
                            <Slide
                              slide={cover}
                              index={0}
                              total={doc.slides.length}
                              ctx={slideCtx(style, post.account)}
                            />
                          </SlideScaled>
                        ) : (
                          <div style={{ aspectRatio: "4/5", width: "100%" }} />
                        )}
                        <span style={{ ...statusPill(post.status), position: "absolute", top: "8px", right: "8px", zIndex: 2 }}>
                          {post.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: "6px" }}>
                        {post.updatedAt.toLocaleDateString()}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--muted)" }}>No pieces yet.</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px", minWidth: 0 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "20px 22px" }}>
            <h2 style={display(19, 700, { margin: "0 0 15px" })}>Connected accounts</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
              {accounts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "11px",
                      background: a.mark,
                      color: "#f4efe0",
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: "15px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {a.initials}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{a.name}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {a.locale} · {a.channels.length} channels
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {a.channels.map((c) => (
                      <span
                        key={c.id}
                        title={c.externalId ? c.platform : `${c.platform} — no channel id set`}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "7px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: c.externalId ? "var(--slate)" : "var(--border-2)",
                        }}
                      >
                        <Icon name={PLATFORMS[c.platform]?.icon ?? "ig"} size={13} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "20px 22px" }}>
            <h2 style={display(19, 700, { margin: "0 0 15px" })}>Integration health</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {integrations.map((h) => (
                <div key={h.provider} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600, textTransform: "capitalize" }}>{h.provider}</div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {h.connected ? (h.usingPlatformKey ? "platform key" : (h.maskedKey ?? "connected")) : "not connected"}
                    </div>
                  </div>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: h.connected ? "var(--ok-fg)" : "var(--border-2)",
                      flexShrink: 0,
                    }}
                  />
                </div>
              ))}
            </div>
            <Link href="/settings" style={{ display: "block", marginTop: "15px", fontSize: "13px", fontWeight: 600 }}>
              Manage integrations →
            </Link>
          </div>

          {latestIdea ? (
            <div style={{ background: "linear-gradient(150deg,#3b5a78,#5c7556)", borderRadius: "18px", padding: "20px 22px", color: "#f4efe0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "9px" }}>
                <Icon name="sparkles" size={16} strokeWidth={2.2} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    letterSpacing: ".13em",
                    textTransform: "uppercase",
                    opacity: 0.9,
                  }}
                >
                  Suggested next
                </span>
              </div>
              <div style={display(17, 700, { lineHeight: 1.25, marginBottom: "6px" })}>{latestIdea.title}</div>
              <div style={{ fontSize: "13px", lineHeight: 1.5, opacity: 0.9, marginBottom: "14px" }}>{latestIdea.angle}</div>
              <Link
                href="/create"
                style={{
                  background: "#f4efe0",
                  color: "var(--ink)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "inline-block",
                }}
              >
                Draft it →
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
