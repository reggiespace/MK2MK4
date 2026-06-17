import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function PiecesPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; status?: string }>;
}) {
  const { brandId, status } = await searchParams;

  const pieces = await prisma.contentPiece.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { name: true } },
      idea: { select: { title: true } },
    },
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pieces</h1>
        <Link href="/ideate" className="btn">New post</Link>
      </div>

      <section className="section">
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
    </div>
  );
}
