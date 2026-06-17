import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { getPublisher } from "@/lib/publishers";
import { checkClaims } from "@/lib/claims/check";

const bodySchema = z.object({
  pieceId: z.string(),
  channelId: z.string(),
  network: z.enum(["facebook", "instagram"]),
  scheduledAt: z.string().datetime().optional(),   // ISO string; omit for publishNow
  dryRun: z.boolean().default(false),
});

export async function POST(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request body.");
  const { pieceId, channelId, network, dryRun } = parsed.data;
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined;

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: {
      brand: true,
      mediaAssets: true,
      slides: { orderBy: { index: "asc" } },
    },
  });
  if (!piece) return badRequest("Unknown piece.");

  // Claims-check gate — block if there are unresolved blocks.
  const fullText = [piece.caption, ...piece.slides.map((s) => s.headline ?? "")].join(" ");
  const claims = checkClaims(fullText);
  if (!claims.canSchedule) {
    return NextResponse.json(
      {
        error: "Claims check failed. Resolve blocking violations before scheduling.",
        findings: claims.findings,
      },
      { status: 422 },
    );
  }

  const publisher = getPublisher(piece.brand.publisher as "buffer" | "zernio");
  const mediaUrls = piece.mediaAssets.map((a) => a.url);
  const idempotencyKey = nanoid();

  const opts = {
    caption: piece.caption,
    hashtags: piece.hashtags,
    mediaUrls,
    format: piece.format as "single" | "carousel" | "reel",
    channelId,
    network,
    idempotencyKey,
    scheduledAt: scheduledAt ?? new Date(),
  };

  if (dryRun) {
    const payload = await publisher.dryRun(opts);
    return NextResponse.json({ dryRun: true, payload });
  }

  try {
    let result;
    if (scheduledAt) {
      result = await publisher.schedule(opts);
    } else {
      const { scheduledAt: _unused, ...nowOpts } = opts;
      result = await publisher.publishNow(nowOpts);
    }

    const post = await prisma.scheduledPost.create({
      data: {
        pieceId,
        channel: channelId,
        network,
        scheduledAt: scheduledAt ?? new Date(),
        provider: piece.brand.publisher as "buffer" | "zernio",
        providerPostId: result.providerPostId,
        status: scheduledAt ? "scheduled" : "published",
        idempotencyKey,
      },
    });

    await prisma.contentPiece.update({
      where: { id: pieceId },
      data: { status: scheduledAt ? "scheduled" : "published", updatedAt: new Date() },
    });

    return NextResponse.json({ post, result });
  } catch (err) {
    console.error("schedule failed", err);
    return serverError("Scheduling failed. Check provider configuration.");
  }
}

export async function GET(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const pieceId = searchParams.get("pieceId");
  const publisher = getPublisher("buffer");

  if (!pieceId) return badRequest("pieceId required for best-time lookup.");

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: { brand: true },
  });
  if (!piece) return badRequest("Unknown piece.");

  const channels = (piece.brand.channels as { network: string; channelId: string }[]) ?? [];
  const pub = getPublisher(piece.brand.publisher as "buffer" | "zernio");
  const bestTimes = await Promise.all(
    channels.map(async (c) => ({
      channelId: c.channelId,
      network: c.network,
      bestTime: (await pub.getBestTime(c.channelId, c.network).catch(() => null))?.toISOString(),
    })),
  );

  return NextResponse.json({ bestTimes });
}
