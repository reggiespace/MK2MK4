import Link from "next/link";
import { prisma } from "@/lib/db";
import { integrationStatus } from "@/lib/env";

export default async function DashboardPage() {
  const [brands, pieces] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { key: "asc" },
      include: { _count: { select: { pillars: true, pieces: true } } },
    }),
    prisma.contentPiece.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        brand: { select: { name: true } },
        idea: { select: { title: true } },
      },
    }),
  ]);
  const status = integrationStatus();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <Link href="/ideate" className="btn">New post</Link>
      </div>

      <section className="section">
        <p className="eyebrow">Brands</p>
        <div className="cards">
          {brands.map((b) => (
            <div key={b.id} className="card">
              <h3>{b.name}</h3>
              <p className="muted">
                {b.locale === "pt_BR" ? "Português (BR)" : "English"} ·{" "}
                {b._count.pillars} pillars · {b._count.pieces} pieces
              </p>
              <Link href={`/ideate?brandId=${b.id}`} className="card-action">
                Create content →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="eyebrow">Recent pieces</p>
        {pieces.length === 0 ? (
          <p className="muted">No pieces yet. <Link href="/ideate">Start ideating →</Link></p>
        ) : (
          <div className="piece-list">
            {pieces.map((p) => (
              <Link key={p.id} href={`/pieces/${p.id}`} className="piece-row">
                <span className="piece-title">{p.idea?.title ?? "Untitled"}</span>
                <span className="badge badge-format">{p.format}</span>
                <span className={`badge badge-status badge-${p.status}`}>{p.status}</span>
                <span className="muted piece-brand">{p.brand.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <p className="eyebrow">Integrations</p>
        <ul className="status-list">
          {Object.entries(status).map(([k, ok]) => (
            <li key={k} className="status-item">
              <span className={`dot ${ok ? "ok" : "off"}`} />
              {k}: {ok ? "configured" : "missing key"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
