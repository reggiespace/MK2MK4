import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard, badRequest } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) return badRequest("brandId required.");

  const ideas = await prisma.idea.findMany({
    where: { brandId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, angle: true, recommendedFormat: true },
  });

  return NextResponse.json({ ideas });
}
