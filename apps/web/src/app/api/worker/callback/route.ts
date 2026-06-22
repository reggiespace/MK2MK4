import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";

const bodySchema = z.object({
  jobId: z.string(),
  pieceId: z.string(),
  assets: z.array(
    z.object({
      url: z.string(),
      type: z.enum(["image", "video", "audio"]),
      engine: z.string().optional(),
      slideIndex: z.number().optional(),
      prompt: z.string().nullish(),
      costCents: z.number().optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

export async function POST(req: Request) {
  // Verify the worker secret (same token used in both directions).
  const secret = env.workerSharedSecret();
  if (secret) {
    const incoming = req.headers.get("x-worker-secret");
    if (incoming !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { jobId, pieceId, assets } = parsed.data;

  if (assets.length === 0) {
    // Render failed — mark the job and piece.
    await prisma.renderJob.updateMany({
      where: { id: jobId },
      data: { status: "failed", updatedAt: new Date() },
    });
    await prisma.contentPiece.update({
      where: { id: pieceId },
      data: { status: "failed", updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Persist media assets.
  const created = await Promise.all(
    assets.map((a) =>
      prisma.mediaAsset.create({
        data: {
          pieceId,
          type: a.type,
          url: a.url,
          engine: (a.engine as "template" | "fal" | "elevenlabs") ?? "template",
          prompt: a.prompt ?? null,
          costCents: a.costCents ?? 0,
          meta: (a.meta as Prisma.InputJsonValue) ?? undefined,
        },
      }),
    ),
  );

  // Associate assets with slides by index when available.
  for (const [i, asset] of created.entries()) {
    const src = assets[i];
    if (src.slideIndex !== undefined) {
      await prisma.slide.updateMany({
        where: { pieceId, index: src.slideIndex },
        data: { mediaAssetId: asset.id },
      });
    }
  }

  const totalCost = assets.reduce((sum, a) => sum + (a.costCents ?? 0), 0);

  // Mark job done and piece ready for review.
  await prisma.renderJob.updateMany({
    where: { id: jobId },
    data: { status: "done", progress: 100, updatedAt: new Date() },
  });
  await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: "review",
      costCents: { increment: totalCost },
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
