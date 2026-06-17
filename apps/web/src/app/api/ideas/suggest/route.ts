import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { loadBrand } from "@/lib/brand";
import { getLlmProvider } from "@/lib/llm/provider";

const bodySchema = z.object({
  brandId: z.string(),
  pillarId: z.string().optional(),
  brief: z.string().optional(),
  count: z.number().int().min(1).max(8).default(5),
});

export async function POST(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request body.");
  const { brandId, pillarId, brief, count } = parsed.data;

  const brand = await loadBrand(brandId);
  if (!brand) return badRequest("Unknown brand.");

  let pillarName: string | undefined;
  if (pillarId) {
    const pillar = await prisma.pillar.findFirst({ where: { id: pillarId, brandId } });
    if (!pillar) return badRequest("Unknown pillar for brand.");
    pillarName = pillar.name;
  }

  try {
    const llm = getLlmProvider();
    const ideas = await llm.suggestIdeas(brand.context, { count, pillarName, brief });

    // Persist suggestions so they can be selected later.
    const created = await Promise.all(
      ideas.map(async (idea) => {
        const matchedPillar = await prisma.pillar.findFirst({
          where: { brandId, name: idea.pillarName ?? pillarName ?? "" },
        });
        return prisma.idea.create({
          data: {
            brandId,
            pillarId: matchedPillar?.id ?? pillarId ?? null,
            title: idea.title,
            angle: idea.angle,
            recommendedFormat: idea.recommendedFormat,
          },
        });
      }),
    );

    return NextResponse.json({ provider: llm.name, ideas: created });
  } catch (err) {
    console.error("ideas/suggest failed", err);
    return serverError("Idea generation failed.");
  }
}
