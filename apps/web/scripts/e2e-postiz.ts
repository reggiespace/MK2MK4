/**
 * End-to-end smoke: real DB → pipeline (mock LLM) → worker render → attach
 * assets → Postiz publish dry-run, for both brands. Proves content is produced
 * in the correct language per brand and that the Postiz payload is well-formed.
 *
 * Run with: tsx scripts/e2e-postiz.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { loadBrand } from "../src/lib/brand";
import { runDailyForBrand } from "../src/lib/pipeline/run";
import { getPublisher, type PublisherKey, type PostFormat } from "../src/lib/publishers";

const WORKER = process.env.WORKER_BASE_URL ?? "http://localhost:8000";
const SECRET = process.env.WORKER_SHARED_SECRET ?? "";

function log(...a: unknown[]) {
  console.log(...a);
}

/** Enqueue render to the worker and poll the job until it finishes. */
type RenderedAsset = { url: string; type: string; engine?: string; meta?: { width?: number; height?: number } };

async function renderViaWorker(pieceId: string): Promise<RenderedAsset[]> {
  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: { slides: { orderBy: { index: "asc" } }, brand: { include: { brandKit: true } } },
  });
  if (!piece) throw new Error("piece not found");
  const kind = piece.format === "single" ? "image" : piece.format;

  const job = await prisma.renderJob.create({ data: { pieceId, kind, status: "queued" } });
  const payload = {
    jobId: job.id,
    pieceId,
    kind,
    slides: piece.slides.map((s) => ({
      index: s.index, role: s.role, skin: s.skin,
      eyebrow: s.eyebrow, headline: s.headline, body: s.body, imagePrompt: s.imagePrompt,
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

  const res = await fetch(`${WORKER}/render/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Worker-Secret": SECRET },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`worker render ${res.status}: ${await res.text()}`);

  // Poll job status.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const st = await fetch(`${WORKER}/jobs/${job.id}`, { headers: { "X-Worker-Secret": SECRET } });
    const data = await st.json();
    if (data.status === "done") {
      // Persist assets like the real worker callback would.
      for (const a of data.assets) {
        await prisma.mediaAsset.create({
          data: {
            pieceId, url: a.url, type: a.type === "video" ? "video" : "image",
            engine: a.engine === "fal" ? "fal" : "template",
            meta: a.meta ?? undefined,
          },
        });
      }
      await prisma.renderJob.update({ where: { id: job.id }, data: { status: "done" } });
      return data.assets;
    }
    if (data.status === "failed") throw new Error(`render failed: ${data.error}`);
  }
  throw new Error("render timed out");
}

async function main() {
  const brands = await prisma.brand.findMany({ orderBy: { key: "asc" }, include: { brandKit: true } });
  // Dates chosen to hit specific cadence formats: Mon=carousel, Wed=single/reel, Sat=story.
  const dates: Record<string, Date> = {
    carousel: new Date("2026-07-20T14:00:00Z"), // Monday
    story: new Date("2026-07-25T14:00:00Z"),    // Saturday
  };

  for (const b of brands) {
    const loaded = await loadBrand(b.id);
    if (!loaded) throw new Error(`no context for ${b.key}`);

    for (const [label, when] of Object.entries(dates)) {
      log(`\n=================== ${b.name} (${b.locale}) — ${label} @ ${when.toDateString()} ===================`);
      const outcome = await runDailyForBrand(
        {
          id: b.id, name: b.name, locale: b.locale, publisher: b.publisher as PublisherKey,
          context: loaded.context, defaultSkin: b.brandKit?.defaultSkin ?? "mark_forward",
        },
        when,
        { enqueueRender: async () => {} }, // we render manually below to await it
      );
      if (outcome.skipped || !outcome.pieceId) {
        log(`  (skipped: ${outcome.reason})`);
        continue;
      }

      const piece = await prisma.contentPiece.findUnique({
        where: { id: outcome.pieceId },
        include: { brand: true, slides: { orderBy: { index: "asc" } } },
      });
      if (!piece) throw new Error("piece vanished");

      log(`  format: ${piece.format}  status: ${piece.status}`);
      log(`  caption: ${piece.caption.slice(0, 120)}${piece.caption.length > 120 ? "…" : ""}`);
      log(`  hashtags: ${piece.hashtags.join(", ")}`);
      log(`  slides: ${piece.slides.length}`);

      // Render real media via the worker.
      const assets = await renderViaWorker(piece.id);
      log(`  rendered ${assets.length} asset(s):`);
      for (const a of assets) log(`    - ${a.type}  ${a.url}  (${a.meta?.width}x${a.meta?.height})`);

      // Dry-run the Postiz publish for the Instagram channel.
      const channels = (piece.brand.channels as { network: string; channelId: string }[]) ?? [];
      const ig = channels.find((c) => c.network === "instagram")!;
      const pub = getPublisher(piece.brand.publisher as PublisherKey);
      const mediaUrls = assets.map((a) => a.url);
      const dry = await pub.dryRun({
        caption: piece.caption,
        firstComment: piece.firstComment ?? undefined,
        hashtags: piece.hashtags,
        mediaUrls,
        format: piece.format as PostFormat,
        scheduledAt: new Date(when.getTime() + 20 * 3600_000),
        channelId: ig.channelId,
        network: "instagram",
        idempotencyKey: "e2e-" + piece.id,
      });
      log(`  POSTIZ dry-run payload:`);
      log(JSON.stringify(dry, null, 2).split("\n").map((l) => "    " + l).join("\n"));
    }
  }

  await prisma.$disconnect();
  log("\nE2E complete.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
