// apps/web/src/lib/pipeline/__tests__/run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const upsertRun = vi.fn();
const findCadence = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    cadence: { findMany: (...a: unknown[]) => findCadence(...a) },
    contentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: (...a: unknown[]) => upsertRun(...a),
      update: vi.fn(),
    },
    pillar: { findFirst: vi.fn().mockResolvedValue({ id: "pillar1" }) },
    idea: { create: vi.fn().mockResolvedValue({ id: "idea1", title: "t", angle: "a" }), update: vi.fn() },
    contentPiece: { create: (...a: unknown[]) => create(...a) },
  },
}));

// The LLM's own `recommendedFormat` opinion can diverge from the format the
// cadence actually requested — the persisted piece must trust the cadence.
vi.mock("@/lib/llm/provider", () => ({
  getLlmProvider: () => ({
    composeStory: vi.fn().mockResolvedValue({
      story: "s", keyMessage: "k", beats: [], ctaIntent: "c",
    }),
    draft: vi.fn().mockResolvedValue({
      caption: "c",
      hashtags: [],
      recommendedFormat: "reel",
      formatRationale: "r",
      slides: [{ role: "cover", headline: "h" }],
    }),
  }),
}));

import { runDailyForBrand } from "@/lib/pipeline/run";

const brand = {
  id: "b1", name: "Gastric IQ", locale: "en" as const, publisher: "buffer" as const,
  context: { name: "Gastric IQ", locale: "en" as const, toneGuide: "calm",
    pillars: [{ name: "Protein & lean mass", description: "x" }] },
  defaultSkin: "mark_forward" as const,
};

beforeEach(() => { create.mockReset(); upsertRun.mockReset(); findCadence.mockReset(); });

describe("runDailyForBrand", () => {
  it("skips a day with no cadence", async () => {
    findCadence.mockResolvedValue([]); // no rows
    const enqueueRender = vi.fn();
    const res = await runDailyForBrand(brand, new Date("2026-06-21T12:00:00Z"), { enqueueRender });
    expect(res.skipped).toBe(true);
    expect(enqueueRender).not.toHaveBeenCalled();
  });

  it("creates a piece and enqueues render on a cadence day", async () => {
    findCadence.mockResolvedValue([
      { weekday: 1, pillar: "Protein & lean mass", format: "single", networks: ["instagram"] },
    ]);
    upsertRun.mockResolvedValue({ id: "run1" });
    create.mockResolvedValue({ id: "piece1", caption: "c", slides: [{ headline: "h" }] });
    const enqueueRender = vi.fn().mockResolvedValue(undefined);
    const res = await runDailyForBrand(brand, new Date("2026-06-22T12:00:00Z"), { enqueueRender });
    expect(res.skipped).toBe(false);
    expect(res.pieceId).toBe("piece1");
    expect(enqueueRender).toHaveBeenCalledWith("piece1");
  });

  it("persists the cadence's format, not the LLM's own recommendedFormat opinion", async () => {
    findCadence.mockResolvedValue([
      { weekday: 1, pillar: "Protein & lean mass", format: "single", networks: ["instagram"] },
    ]);
    upsertRun.mockResolvedValue({ id: "run1" });
    create.mockResolvedValue({ id: "piece1", caption: "c", slides: [{ headline: "h" }] });
    const enqueueRender = vi.fn().mockResolvedValue(undefined);
    await runDailyForBrand(brand, new Date("2026-06-22T12:00:00Z"), { enqueueRender });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ format: "single" }) }),
    );
  });
});
