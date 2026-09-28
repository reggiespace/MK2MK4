import { describe, expect, it, vi } from "vitest";

/**
 * `getManifest` is mocked so we can exercise a slot with a negative `max`,
 * a shape real manifests don't currently declare but which `fitToBudget`
 * (schema.ts:94) already treats as unbounded. `describeSlots` must agree.
 */
vi.mock("@/lib/templates/manifests", () => ({
  getManifest: () => ({
    kinds: {
      negative: {
        role: "frame",
        ground: "dark",
        name: "Negative",
        desc: "synthetic kind for the unbounded-budget regression",
        slots: [{ id: "weird", type: "text", max: -1, required: true, label: "Weird" }],
      },
    },
  }),
}));

import { describeSlots } from "../schema";
import type { TemplateStyleId } from "@/lib/templates/types";

describe("describeSlots", () => {
  it("does not tell the model to write a negative character budget", () => {
    const prompt = describeSlots("story" as TemplateStyleId, "negative");
    expect(prompt).not.toMatch(/≤ -1 chars/);
  });

  it("describes a negative-max slot as unbounded, same as max: 0", () => {
    const prompt = describeSlots("story" as TemplateStyleId, "negative");
    expect(prompt).toContain("weird (Weird): no length limit, required");
  });

  it("never instructs the model to write zero characters for a required slot", () => {
    const prompt = describeSlots("story" as TemplateStyleId, "negative");
    expect(prompt).not.toMatch(/≤ 0 chars/);
  });
});

describe("describeSlots against the real story manifest", () => {
  it("gives targetTime and linkUrl no character budget on the countdown frame", async () => {
    vi.doUnmock("@/lib/templates/manifests");
    vi.resetModules();
    const { describeSlots: realDescribeSlots } = await import("../schema");
    const prompt = realDescribeSlots("story", "1e-countdown");
    expect(prompt).toContain("targetTime (Target time): no length limit, required");
    expect(prompt).toContain("linkUrl (Link URL): no length limit, required");
  });

  it("gives postRef no character budget on the reshare frame", async () => {
    vi.doUnmock("@/lib/templates/manifests");
    vi.resetModules();
    const { describeSlots: realDescribeSlots } = await import("../schema");
    const prompt = realDescribeSlots("story", "1f-reshare");
    expect(prompt).toContain("postRef (Post ref): no length limit, required");
  });
});
