import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Create a RenderJob for a content piece and dispatch it to the worker
 * (fire-and-forget). Mirrors the logic in
 * `apps/web/src/app/api/pieces/[id]/render/route.ts` so the cron/autopilot
 * path and the HTTP route stay in sync. Brand-agnostic: looks up everything
 * it needs from the piece's own relations.
 */
export async function enqueueRender(pieceId: string): Promise<void> {
  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: {
      slides: { orderBy: { index: "asc" } },
      brand: { include: { brandKit: true } },
    },
  });
  if (!piece) throw new Error(`enqueueRender: unknown piece ${pieceId}`);

  // Map content format to render job kind (single image -> "image").
  const kind = piece.format === "single" ? "image" : piece.format;

  const job = await prisma.renderJob.create({
    data: { pieceId, kind, status: "queued" },
  });

  // Kick off the worker (fire-and-forget; worker updates job status via callback).
  const workerUrl = env.workerBaseUrl();
  const secret = env.workerSharedSecret();

  if (workerUrl) {
    const payload = {
      jobId: job.id,
      pieceId,
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
      where: { id: pieceId },
      data: { status: "rendering" },
    });
  }
}
