import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard, badRequest } from "@/lib/api";
import { checkClaims, applyAutoFixes, fullTextForClaims } from "@/lib/claims/check";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    select: { id: true, caption: true, slides: { select: { headline: true, body: true } } },
  });
  if (!piece) return badRequest("Unknown piece.");

  const fullText = fullTextForClaims(piece.caption, piece.slides);

  const result = checkClaims(fullText);
  const fixed = applyAutoFixes(fullText);

  return NextResponse.json({
    pieceId: id,
    ...result,
    autoFixedText: fixed !== fullText ? fixed : null,
  });
}
