// apps/web/src/lib/pipeline/run.ts
import "server-only";
import { prisma } from "@/lib/db";
import { getLlmProvider } from "@/lib/llm/provider";
import { checkClaims } from "@/lib/claims/check";
import { getResearch } from "./research";
import { pickCadence, runDateUTC, type CadenceRow } from "./cadence";
import { captionWithinLimit } from "./limits";
import type { BrandContext } from "@/lib/llm/types";
import type { Skin } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface PipelineBrand {
  id: string;
  name: string;
  locale: "en" | "pt_BR";
  publisher: "buffer" | "zernio";
  context: BrandContext;
  defaultSkin: Skin;
}

export interface RunDeps {
  /** Enqueue rendering for a piece (defaults to the HTTP render route). */
  enqueueRender: (pieceId: string) => Promise<void>;
}

export interface RunOutcome {
  skipped: boolean;
  reason?: string;
  runId?: string;
  pieceId?: string;
  blocked?: boolean;
}

export async function runDailyForBrand(
  brand: PipelineBrand,
  when: Date,
  deps: RunDeps,
): Promise<RunOutcome> {
  const cadences = (await prisma.cadence.findMany({
    where: { brandId: brand.id },
  })) as unknown as CadenceRow[];
  const cadence = pickCadence(cadences, when);
  if (!cadence) return { skipped: true, reason: "no-cadence" };

  const runDate = runDateUTC(when);

  // Idempotency: one run per (brand, date, pillar).
  const existing = await prisma.contentRun.findUnique({
    where: { brandId_runDate_pillar: { brandId: brand.id, runDate, pillar: cadence.pillar } },
  });
  if (existing) return { skipped: true, reason: "already-run", runId: existing.id };

  const run = await prisma.contentRun.create({
    data: { brandId: brand.id, runDate, pillar: cadence.pillar, format: cadence.format, status: "running" },
  });

  try {
    const llm = getLlmProvider();

    // 1. Research → 2. Writer
    const research = await getResearch(brand.id, when);
    const story = await llm.composeStory(brand.context, {
      pillarName: cadence.pillar,
      research: research.summary ?? undefined,
    });

    // 3. Ideate (persist an Idea carrying the story brief)
    const matchedPillar = await prisma.pillar.findFirst({
      where: { brandId: brand.id, name: cadence.pillar },
    });
    const idea = await prisma.idea.create({
      data: {
        brandId: brand.id,
        pillarId: matchedPillar?.id ?? null,
        title: story.keyMessage.slice(0, 80),
        angle: story.story,
        recommendedFormat: cadence.format,
        insightsContext: research.summary ?? null,
        storyBrief: story as unknown as Prisma.InputJsonValue,
        status: "selected",
      },
    });

    // 4. Generate the piece from the story brief
    const draft = await llm.draft(brand.context, {
      title: idea.title,
      angle: idea.angle,
      format: cadence.format,
      story,
    });
    const fullText = [draft.caption, ...draft.slides.map((s) => s.headline ?? "")].join(" ");
    const claims = checkClaims(fullText);
    const lengthOk = captionWithinLimit(draft.caption, cadence.networks).ok;
    const blocked = !claims.canSchedule || !lengthOk;

    const piece = await prisma.contentPiece.create({
      data: {
        brandId: brand.id,
        ideaId: idea.id,
        runId: run.id,
        format: draft.recommendedFormat,
        caption: draft.caption,
        firstComment: draft.firstComment ?? null,
        hashtags: draft.hashtags,
        formatRationale: draft.formatRationale,
        voiceover: draft.voiceover ?? null,
        claims: claims as unknown as Prisma.InputJsonValue,
        status: blocked ? "blocked" : "draft",
        slides: {
          create: draft.slides.map((s, i) => ({
            index: i,
            role: s.role,
            skin: brand.defaultSkin,
            eyebrow: s.eyebrow ?? null,
            headline: s.headline ?? null,
            body: s.body ?? null,
            imagePrompt: s.imagePrompt ?? null,
          })),
        },
      },
      include: { slides: { orderBy: { index: "asc" } } },
    });
    await prisma.idea.update({ where: { id: idea.id }, data: { status: "used" } });

    if (blocked) {
      await prisma.contentRun.update({ where: { id: run.id }, data: { status: "complete" } });
      return { skipped: false, runId: run.id, pieceId: piece.id, blocked: true };
    }

    // 5. Enqueue render (worker callback flips piece → review once hosted)
    await deps.enqueueRender(piece.id);
    await prisma.contentRun.update({ where: { id: run.id }, data: { status: "complete" } });
    return { skipped: false, runId: run.id, pieceId: piece.id, blocked: false };
  } catch (err) {
    await prisma.contentRun.update({
      where: { id: run.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
