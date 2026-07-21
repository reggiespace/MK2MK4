import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { env } from "@/lib/env";
import { buildRenderPayload, renderKindFor } from "@/lib/pipeline/render-payload";

const bodySchema = z.object({
  kind: z.enum(["image", "carousel", "reel", "story"]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    include: {
      slides: { orderBy: { index: "asc" } },
      brand: { include: { brandKit: true } },
    },
  });
  if (!piece) return badRequest("Unknown piece.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Invalid body.");

  // Map content format to render job kind (single image → "image").
  const kind = parsed.data.kind ?? renderKindFor(piece.format);

  // Create a render job record.
  const job = await prisma.renderJob.create({
    data: { pieceId: id, kind, status: "queued" },
  });

  // Kick off the worker (fire-and-forget; worker updates job status via callback).
  const workerUrl = env.workerBaseUrl();
  const secret = env.workerSharedSecret();

  if (workerUrl) {
    const payload = buildRenderPayload(piece, job.id, kind);

    fetch(`${workerUrl}/render/${kind}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Worker-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    }).catch((err) => console.error("worker dispatch failed", err));

    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "running" },
    });
    await prisma.contentPiece.update({
      where: { id },
      data: { status: "rendering" },
    });
  }

  return NextResponse.json({ job });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const jobs = await prisma.renderJob.findMany({
    where: { pieceId: id },
    orderBy: { createdAt: "desc" },
  });

  if (!jobs.length) return badRequest("No render jobs for this piece.");
  return NextResponse.json({ jobs });
}
