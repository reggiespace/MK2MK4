import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PieceReview } from "./piece-review";

export default async function PiecePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    include: {
      slides: { orderBy: { index: "asc" } },
      mediaAssets: true,
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      idea: { select: { title: true, angle: true, storyBrief: true, pillar: { select: { name: true } } } },
      brand: { select: { id: true, name: true, locale: true, publisher: true, channels: true } },
    },
  });

  if (!piece) notFound();

  const channels = (piece.brand.channels as { network: string; channelId: string; label?: string }[]) ?? [];

  return <PieceReview piece={piece} brandChannels={channels} />;
}
