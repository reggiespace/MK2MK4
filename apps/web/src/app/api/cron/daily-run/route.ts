import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { loadBrand } from "@/lib/brand";
import { runDailyForBrand, type RunOutcome } from "@/lib/pipeline/run";
import { enqueueRender } from "@/lib/pipeline/enqueue-render";

export async function POST(req: Request) {
  const secret = env.cronSecret();
  if (secret) {
    if (req.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const when = new Date();
  const brands = await prisma.brand.findMany({ include: { brandKit: true } });

  const results: Record<string, RunOutcome | { error: string }> = {};
  for (const b of brands) {
    const loaded = await loadBrand(b.id);
    if (!loaded) {
      results[b.key] = { error: "brand context unavailable" };
      continue;
    }
    try {
      results[b.key] = await runDailyForBrand(
        {
          id: b.id,
          name: b.name,
          locale: b.locale,
          publisher: b.publisher,
          context: loaded.context,
          defaultSkin: b.brandKit?.defaultSkin ?? "mark_forward",
        },
        when,
        { enqueueRender },
      );
    } catch (err) {
      results[b.key] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ranAt: when.toISOString(), results });
}
