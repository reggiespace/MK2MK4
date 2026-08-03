import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { Slide } from "@/components/slide/Slide";
import { SlideFit } from "@/components/slide/SlideFrame";
import { Icon, PLATFORMS } from "@/components/ui/Icon";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { display, kicker, statusPill } from "@/components/create/styles";
import { ACCOUNT_WITH_LOGO, slideCtx } from "@/lib/slide-context";
import { StickerPlan } from "@/components/create/StickerPlan";

/** A single piece: every slide as rendered, plus its delivery and schedule. */
export default async function PiecePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAuth();

  const post = await prisma.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: {
      account: ACCOUNT_WITH_LOGO,
      scheduledPosts: { include: { channel: true }, orderBy: { scheduledAt: "asc" } },
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!post) notFound();

  const doc = post.doc as unknown as PostDoc;
  const style = post.style as TemplateStyleId;
  const man = getManifest(style);
  const ctx = slideCtx(style, post.account);

  return (
    <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "32px 40px 64px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <Link href="/pieces" style={{ ...kicker, display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <Icon name="chevL" size={13} strokeWidth={2.6} />
            Pieces
          </Link>
          <h1 style={display(30, 700, { margin: 0, lineHeight: 1.1 })}>{post.topic || man.label}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "9px" }}>
            <span style={statusPill(post.status)}>{post.status}</span>
            <span style={{ fontSize: "12.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              {man.label} · {doc.slides.length} {doc.slides.length === 1 ? "frame" : "frames"} · {post.account.name}
            </span>
          </div>
        </div>
        {post.status === "draft" ? (
          <Link
            href={`/create?postId=${post.id}`}
            className="hover-lift"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--accent)",
              color: "#f4efe0",
              borderRadius: "11px",
              padding: "11px 18px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icon name="arrowR" size={16} strokeWidth={2.4} />
            Edit draft
          </Link>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: "26px", alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: "16px" }}>
          {doc.slides.map((slide, i) => (
            <div key={i} className="slide-art" style={{ borderRadius: "12px", overflow: "hidden", boxShadow: "0 8px 22px rgba(26,34,48,.14)" }}>
              <SlideFit style={style} maxWidth={220}>
                <Slide slide={slide} index={i} total={doc.slides.length} ctx={ctx} />
              </SlideFit>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Stories ship as flat images; the tappable stickers are placed by hand. */}
          <StickerPlan style={style} doc={doc} />
          {!man.noCaption ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}>
              <div style={{ ...kicker, marginBottom: "10px" }}>Caption</div>
              <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--ink)" }}>
                {post.caption || "—"}
              </p>
              {post.hashtags.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "10px" }}>
                  {post.hashtags.map((h) => (
                    <span key={h} style={{ fontSize: "12.5px", color: "var(--slate)", fontFamily: "var(--font-mono)" }}>
                      {h}
                    </span>
                  ))}
                </div>
              ) : null}
              {post.firstComment ? (
                <>
                  <div style={{ ...kicker, margin: "16px 0 8px" }}>First comment</div>
                  <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--muted)" }}>
                    {post.firstComment}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}>
            <div style={{ ...kicker, marginBottom: "12px" }}>Schedule</div>
            {post.scheduledPosts.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                {post.scheduledPosts.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ display: "flex", color: "var(--slate)" }}>
                      <Icon name={PLATFORMS[s.channel.platform]?.icon ?? "ig"} size={16} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
                        {PLATFORMS[s.channel.platform]?.name ?? s.channel.platform}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                        {s.scheduledAt.toLocaleString()}
                      </div>
                    </div>
                    <span style={statusPill(s.status)}>{s.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Not scheduled yet.</p>
            )}
            {post.scheduledPosts.some((s) => s.error) ? (
              <div
                style={{
                  marginTop: "12px",
                  background: "var(--danger-bg)",
                  color: "var(--danger-fg)",
                  borderRadius: "9px",
                  padding: "9px 12px",
                  fontSize: "12px",
                }}
              >
                {post.scheduledPosts.find((s) => s.error)?.error}
              </div>
            ) : null}
          </div>

          {post.renderJobs[0]?.error ? (
            <div
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger-fg)",
                borderRadius: "12px",
                padding: "12px 15px",
                fontSize: "12.5px",
              }}
            >
              Last render failed: {post.renderJobs[0].error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
