import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { Slide } from "@/components/slide/Slide";
import { SlideScaled } from "@/components/slide/SlideFrame";
import { Icon } from "@/components/ui/Icon";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { display, statusPill } from "@/components/create/styles";
import { ACCOUNT_WITH_LOGO, slideCtx } from "@/lib/slide-context";

/**
 * The content library. Thumbnails are drawn by the shared renderer, so a piece
 * looks here exactly as it does in the feed.
 */

const STATUS_TABS = ["all", "draft", "review", "scheduled", "published"] as const;

export default async function PiecesPage(props: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "all", q = "" } = await props.searchParams;
  const auth = await requireAuth();

  const posts = await prisma.post.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(status !== "all" ? { status: status as "draft" } : {}),
      ...(q ? { OR: [{ topic: { contains: q, mode: "insensitive" } }, { caption: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: { account: ACCOUNT_WITH_LOGO, scheduledPosts: { include: { channel: true } } },
  });

  const counts = await prisma.post.groupBy({
    by: ["status"],
    where: { workspaceId: auth.workspaceId },
    _count: true,
  });
  const countFor = (s: string) =>
    s === "all"
      ? counts.reduce((n, c) => n + c._count, 0)
      : (counts.find((c) => c.status === s)?._count ?? 0);

  return (
    <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "22px" }}>
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
            Content library
          </div>
          <h1 style={display(32, 700, { margin: 0, lineHeight: 1.1 })}>Pieces</h1>
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

      <form
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
          {STATUS_TABS.map((t) => {
            const on = t === status;
            return (
              <Link
                key={t}
                href={`/pieces?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
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
                {t}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    background: on ? "rgba(255,255,255,.18)" : "var(--bg)",
                    padding: "2px 7px",
                    borderRadius: "999px",
                  }}
                >
                  {countFor(t)}
                </span>
              </Link>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "7px 14px",
            minWidth: "200px",
          }}
        >
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search pieces"
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: "13.5px",
              color: "var(--ink)",
              width: "100%",
            }}
          />
        </div>
      </form>

      {posts.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "18px" }}>
          {posts.map((post) => {
            const doc = post.doc as unknown as PostDoc;
            const style = post.style as TemplateStyleId;
            const man = getManifest(style);
            const cover = doc?.slides?.[0];
            const channels = [...new Set(post.scheduledPosts.map((s) => s.channel.platform))];

            return (
              <Link
                key={post.id}
                href={`/pieces/${post.id}`}
                className="hover-border"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  padding: "9px",
                  animation: "pop .3s ease both",
                  display: "block",
                  color: "inherit",
                }}
              >
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
                    <SlideScaled style={style} width={202}>
                      <Slide
                        slide={cover}
                        index={0}
                        total={doc.slides.length}
                        ctx={slideCtx(style, post.account)}
                      />
                    </SlideScaled>
                  ) : (
                    <div style={{ aspectRatio: "4/5", width: "100%", background: "var(--bg)" }} />
                  )}
                  <span style={{ ...statusPill(post.status), position: "absolute", top: "8px", right: "8px", zIndex: 2 }}>
                    {post.status}
                  </span>
                </div>

                <div style={{ padding: "11px 5px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "6px",
                        background: post.account.mark,
                        color: "#f4efe0",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "9px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {post.account.initials}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        fontFamily: "var(--font-mono)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {man.label}
                      {channels.length ? ` · ${channels.join(" · ")}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {post.updatedAt.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "52px 20px", color: "var(--muted)" }}>
          <div style={display(18, 700, { color: "var(--ink)", marginBottom: "6px" })}>No pieces found</div>
          <div style={{ fontSize: "14px" }}>
            {q || status !== "all"
              ? "Nothing matches these filters yet. Try a different status or clear the search."
              : "Create your first post and it will appear here."}
          </div>
        </div>
      )}
    </div>
  );
}
