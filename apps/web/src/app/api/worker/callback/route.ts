import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Worker → web callback. The worker screenshots each slide through the render
 * route and posts the resulting media back here.
 */

const bodySchema = z.object({
  jobId: z.string(),
  postId: z.string(),
  error: z.string().nullish(),
  assets: z
    .array(
      z.object({
        url: z.string(),
        kind: z.enum(["photo", "screen", "video", "audio"]).default("photo"),
        /** Slide order for image frames; absent for the reel/voice output. */
        slideIndex: z.number().int().nonnegative().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        costCents: z.number().int().optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
});

export async function POST(req: Request) {
  const secret = env.workerSharedSecret();
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { jobId, postId, assets, error } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, workspaceId: true, accountId: true },
  });
  if (!post) return NextResponse.json({ error: "Unknown post" }, { status: 404 });

  if (error || assets.length === 0) {
    await prisma.renderJob.updateMany({
      where: { id: jobId },
      data: { status: "failed", error: error ?? "Worker returned no assets" },
    });
    await prisma.post.update({ where: { id: postId }, data: { status: "failed" } });
    return NextResponse.json({ ok: true });
  }

  // Persist rendered output into the asset library so it is reusable.
  const created = await Promise.all(
    assets.map((a) =>
      prisma.asset.create({
        data: {
          workspaceId: post.workspaceId,
          accountId: post.accountId,
          name: `Render ${a.slideIndex !== undefined ? `slide ${a.slideIndex + 1}` : "output"}`,
          kind: a.kind,
          url: a.url,
          width: a.width,
          height: a.height,
          ai: false,
          costCents: a.costCents ?? 0,
          meta: (a.meta as Prisma.InputJsonValue) ?? undefined,
        },
      }),
    ),
  );

  // Image frames drive the carousel order; a video output supersedes them.
  const video = assets.findIndex((a) => a.kind === "video");
  const mediaUrls =
    video >= 0
      ? [assets[video].url]
      : assets
          .map((a, i) => ({ a, i }))
          .filter(({ a }) => a.slideIndex !== undefined)
          .sort((x, y) => (x.a.slideIndex ?? 0) - (y.a.slideIndex ?? 0))
          .map(({ a }) => a.url);

  const totalCost = assets.reduce((sum, a) => sum + (a.costCents ?? 0), 0);

  await prisma.renderJob.updateMany({
    where: { id: jobId },
    data: {
      status: "done",
      progress: 100,
      outputs: { assetIds: created.map((c) => c.id), mediaUrls } as Prisma.InputJsonValue,
    },
  });
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "review",
      mediaUrls,
      costCents: { increment: totalCost },
    },
  });

  return NextResponse.json({ ok: true });
}
