import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest, serverError } from "@/lib/api";
import { loadBrand } from "@/lib/brand";
import { getLlmProvider } from "@/lib/llm/provider";
import type { Skin, SlideRole } from "@/generated/prisma/enums";

const bodySchema = z.object({
  ideaId: z.string().optional(),
  brandId: z.string().optional(),
  title: z.string().optional(),
  angle: z.string().optional(),
  format: z.enum(["single", "carousel", "reel"]).optional(),
});

function skinForRole(_role: SlideRole, brandDefault: Skin): Skin {
  return brandDefault;
}

export async function GET(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");

  const pieces = await prisma.contentPiece.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      slides: { orderBy: { index: "asc" }, take: 1 },
      idea: { select: { title: true } },
      brand: { select: { name: true, locale: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return NextResponse.json({ pieces });
}

export async function POST(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request body.");
  const input = parsed.data;

  let brandId = input.brandId;
  let title = input.title;
  let angle = input.angle;
  let format = input.format;
  let ideaId = input.ideaId;

  if (ideaId) {
    const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) return badRequest("Unknown idea.");
    brandId = idea.brandId;
    title = idea.title;
    angle = idea.angle;
    format = format ?? idea.recommendedFormat;
  }

  if (!brandId || !title || !angle) {
    return badRequest("Provide ideaId, or brandId + title + angle.");
  }

  const brand = await loadBrand(brandId);
  if (!brand) return badRequest("Unknown brand.");
  const kit = await prisma.brandKit.findUnique({ where: { brandId } });
  const brandDefaultSkin: Skin = kit?.defaultSkin ?? "mark_forward";

  try {
    const llm = getLlmProvider();
    const draft = await llm.draft(brand.context, { title, angle, format });

    const piece = await prisma.contentPiece.create({
      data: {
        brandId,
        ideaId: ideaId ?? null,
        format: draft.recommendedFormat,
        caption: draft.caption,
        hashtags: draft.hashtags,
        formatRationale: draft.formatRationale,
        voiceover: draft.voiceover ?? null,
        status: "draft",
        slides: {
          create: draft.slides.map((s, i) => ({
            index: i,
            role: s.role,
            skin: skinForRole(s.role, brandDefaultSkin),
            eyebrow: s.eyebrow ?? null,
            headline: s.headline ?? null,
            body: s.body ?? null,
            imagePrompt: s.imagePrompt ?? null,
          })),
        },
      },
      include: { slides: { orderBy: { index: "asc" } } },
    });

    if (ideaId) {
      await prisma.idea.update({ where: { id: ideaId }, data: { status: "used" } });
    }

    return NextResponse.json({ provider: llm.name, piece });
  } catch (err) {
    console.error("pieces create failed", err);
    return serverError("Draft generation failed.");
  }
}
