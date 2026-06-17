import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, badRequest } from "@/lib/api";

const patchSchema = z.object({
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  status: z.enum(["draft", "review", "scheduled", "published", "failed"]).optional(),
  voiceGender: z.enum(["male", "female"]).nullable().optional(),
  motion: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    include: {
      slides: { orderBy: { index: "asc" } },
      mediaAssets: true,
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      idea: { select: { title: true, angle: true, pillar: { select: { name: true } } } },
      brand: { select: { name: true, locale: true } },
    },
  });

  if (!piece) return badRequest("Unknown piece.");
  return NextResponse.json({ piece });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid body.");

  const piece = await prisma.contentPiece.update({
    where: { id },
    data: { ...parsed.data, updatedAt: new Date() },
  });
  return NextResponse.json({ piece });
}
