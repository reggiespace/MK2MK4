import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { loadBrand } from "@/lib/brand";
import { getLlmProvider } from "@/lib/llm/provider";

const bodySchema = z.object({
  mode: z.enum(["rewrite", "shorten", "more-hashtags"]).default("rewrite"),
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
    include: { brand: { include: { brandKit: true, pillars: { orderBy: { name: "asc" } } } } },
  });
  if (!piece) return badRequest("Unknown piece.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Invalid body.");
  const { mode } = parsed.data;

  const brand = await loadBrand(piece.brandId);
  if (!brand) return serverError("Brand not found.");

  const modeInstructions: Record<string, string> = {
    rewrite: "Rewrite the caption with a fresh angle, same tone and locale. Keep hashtags.",
    shorten: "Shorten the caption to under 150 characters. Preserve the key message.",
    "more-hashtags": "Keep the caption. Replace or expand hashtags to 8–12 relevant ones.",
  };

  try {
    const llm = getLlmProvider();
    const result = await llm.draft(brand.context, {
      title: `${modeInstructions[mode]} Current caption: "${piece.caption}"`,
      angle: `Current hashtags: ${piece.hashtags.join(" ")}. Mode: ${mode}`,
      format: piece.format,
    });

    await prisma.contentPiece.update({
      where: { id },
      data: {
        caption: result.caption,
        hashtags: result.hashtags,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      provider: llm.name,
      caption: result.caption,
      hashtags: result.hashtags,
    });
  } catch (err) {
    console.error("regenerate-caption failed", err);
    return serverError("Caption regeneration failed.");
  }
}
