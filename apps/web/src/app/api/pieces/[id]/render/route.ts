import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { env } from "@/lib/env";

const bodySchema = z.object({
  kind: z.enum(["image", "carousel", "reel"]).optional(),
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
  const formatKind = piece.format === "single" ? "image" : piece.format;
  const kind = parsed.data.kind ?? formatKind;

  // Create a render job record.
  const job = await prisma.renderJob.create({
    data: { pieceId: id, kind, status: "queued" },
  });

  // Kick off the worker (fire-and-forget; worker updates job status via callback).
  const workerUrl = env.workerBaseUrl();
  const secret = env.workerSharedSecret();

  if (workerUrl) {
    const payload = {
      jobId: job.id,
      pieceId: id,
      kind,
      slides: piece.slides.map((s) => ({
        index: s.index,
        role: s.role,
        skin: s.skin,
        eyebrow: s.eyebrow,
        headline: s.headline,
        body: s.body,
        imagePrompt: s.imagePrompt,
      })),
      brandKit: {
        logoPath: piece.brand.brandKit?.logoPath ?? "",
        tokens: piece.brand.brandKit?.tokens,
        fonts: piece.brand.brandKit?.fonts,
        defaultSkin: piece.brand.brandKit?.defaultSkin,
        artDirection: piece.brand.brandKit?.artDirection ?? "warm_lifestyle",
        voiceId: piece.brand.brandKit?.voiceId ?? "",
      },
      voiceover: piece.voiceover,
      locale: piece.brand.locale,
      voiceGender: piece.voiceGender ?? "female",
      motion: piece.motion,
    };

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
