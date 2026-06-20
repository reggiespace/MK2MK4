import Link from "next/link";
import { prisma } from "@/lib/db";
import { runDateUTC } from "@/lib/pipeline/cadence";

export default async function QueuePage() {
  const runDate = runDateUTC(new Date());

  const pieces = await prisma.contentPiece.findMany({
    where: { run: { is: { runDate } } },
    include: {
      mediaAssets: { select: { url: true, type: true } },
      brand: { select: { name: true, locale: true } },
      slides: { orderBy: { index: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const dateLabel = runDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Today&apos;s queue — {dateLabel}</h1>
      </div>

      <section className="section">
        {pieces.length === 0 ? (
          <p className="muted">No drafts generated yet for today.</p>
        ) : (
          <div className="cards">
            {pieces.map((p) => {
              const media = p.mediaAssets[0];
              return (
                <Link key={p.id} href={`/pieces/${p.id}`} className="card">
                  <div className="queue-card-badges">
                    <span className="badge badge-format">{p.format}</span>
                    <span className={`badge badge-status badge-${p.status}`}>{p.status}</span>
                  </div>
                  <h3>{p.brand.name}</h3>
                  {media ? (
                    media.type === "video" ? (
                      <video src={media.url} controls muted className="slide-video-preview" />
                    ) : (
                      <img src={media.url} alt="" className="slide-rendered-img" />
                    )
                  ) : (
                    <p className="muted">no media yet</p>
                  )}
                  <p className="queue-caption">{p.caption}</p>
                  {p.firstComment ? <p className="muted">{p.firstComment}</p> : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
