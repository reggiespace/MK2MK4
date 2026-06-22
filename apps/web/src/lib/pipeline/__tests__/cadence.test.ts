import { describe, it, expect } from "vitest";
import { pickCadence, runDateUTC } from "@/lib/pipeline/cadence";

const rows = [
  { weekday: 1, pillar: "A", format: "carousel" as const, networks: ["instagram"] },
  { weekday: 3, pillar: "B", format: "reel" as const, networks: ["instagram"] },
];

describe("pickCadence", () => {
  it("returns the row matching the weekday", () => {
    const monday = new Date("2026-06-22T12:00:00Z"); // Monday
    expect(pickCadence(rows, monday)?.pillar).toBe("A");
  });
  it("returns null on a day with no cadence", () => {
    const sunday = new Date("2026-06-21T12:00:00Z");
    expect(pickCadence(rows, sunday)).toBeNull();
  });
});

describe("runDateUTC", () => {
  it("zeroes the time component", () => {
    const d = runDateUTC(new Date("2026-06-22T18:30:00Z"));
    expect(d.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });
});
