import { describe, it, expect } from "vitest";
import { computeVelocity, computeHealth, buildInsights } from "../src/insights.js";
// computeStreak will be imported once it's exported from insights.ts

describe("computeVelocity", () => {
  it("computes deltaPct from per-package daily series", () => {
    const prev = new Array(30).fill(10); // 300
    const curr = new Array(30).fill(15); // 450 -> +50%
    const result = computeVelocity([
      { name: "a", daily: [...prev, ...curr] },
    ]);
    expect(result.prev30d).toBe(300);
    expect(result.last30d).toBe(450);
    expect(Math.round(result.deltaPct)).toBe(50);
  });

  it("aggregates totals across packages and ranks topGrowing by deltaPct", () => {
    const flat = (n: number) => new Array(60).fill(n);
    const result = computeVelocity([
      { name: "stable", daily: flat(10) },
      { name: "growing", daily: [...new Array(30).fill(5), ...new Array(30).fill(20)] },
      { name: "shrinking", daily: [...new Array(30).fill(20), ...new Array(30).fill(5)] },
    ]);
    expect(result.topGrowing[0]?.name).toBe("growing");
    expect(result.topGrowing).toHaveLength(3);
  });

  it("returns 0 deltaPct when prev30d is 0", () => {
    const result = computeVelocity([
      { name: "new", daily: [...new Array(30).fill(0), ...new Array(30).fill(10)] },
    ]);
    expect(result.deltaPct).toBe(0);
    expect(result.last30d).toBe(300);
  });

  it("handles empty input", () => {
    const result = computeVelocity([]);
    expect(result).toEqual({ last30d: 0, prev30d: 0, deltaPct: 0, topGrowing: [] });
  });
});

describe("computeHealth", () => {
  const now = new Date("2026-05-07T00:00:00.000Z");
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it("classifies packages by recency: <30d active, 30-180d sleeping, >180d dormant", () => {
    const result = computeHealth(
      [
        { name: "fresh", lastActivity: daysAgo(5) },
        { name: "okay", lastActivity: daysAgo(60) },
        { name: "old", lastActivity: daysAgo(365) },
      ],
      now,
    );
    expect(result.active).toBe(1);
    expect(result.sleeping).toBe(1);
    expect(result.dormant).toBe(1);
    expect(result.perPackage).toEqual({
      fresh: "active",
      okay: "sleeping",
      old: "dormant",
    });
  });

  it("treats edge cases at exactly 30 and 180 days", () => {
    const result = computeHealth(
      [
        { name: "boundary30", lastActivity: daysAgo(30) },
        { name: "boundary180", lastActivity: daysAgo(180) },
      ],
      now,
    );
    expect(result.perPackage.boundary30).toBe("sleeping");
    expect(result.perPackage.boundary180).toBe("dormant");
  });

  it("handles empty input", () => {
    const result = computeHealth([], now);
    expect(result).toEqual({ active: 0, sleeping: 0, dormant: 0, perPackage: {} });
  });
});

describe("computeStreak", () => {
  const now = new Date("2026-05-07T00:00:00.000Z");

  it("counts the longest run of consecutive months across packages", async () => {
    const { computeStreak } = await import("../src/insights.js");
    const result = computeStreak(
      [
        {
          name: "a",
          publishTimestamps: [
            "2024-01-15T00:00:00.000Z",
            "2024-02-10T00:00:00.000Z",
            "2024-03-20T00:00:00.000Z",
            "2024-09-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.longestMonths).toBe(3);
    expect(result.longestPackage).toBe("a");
  });

  it("computes currentMonths as ongoing streak ending in the current calendar month", async () => {
    const { computeStreak } = await import("../src/insights.js");
    const result = computeStreak(
      [
        {
          name: "live",
          publishTimestamps: [
            "2026-03-10T00:00:00.000Z",
            "2026-04-10T00:00:00.000Z",
            "2026-05-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.currentMonths).toBe(3);
  });

  it("currentMonths is 0 when last release is older than 1 month from now", async () => {
    const { computeStreak } = await import("../src/insights.js");
    const result = computeStreak(
      [{ name: "stale", publishTimestamps: ["2025-01-01T00:00:00.000Z"] }],
      now,
    );
    expect(result.currentMonths).toBe(0);
  });

  it("picks the package with longest streak when multiple compete", async () => {
    const { computeStreak } = await import("../src/insights.js");
    const result = computeStreak(
      [
        { name: "short", publishTimestamps: ["2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z"] },
        {
          name: "long",
          publishTimestamps: [
            "2024-01-01T00:00:00.000Z",
            "2024-02-01T00:00:00.000Z",
            "2024-03-01T00:00:00.000Z",
            "2024-04-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.longestMonths).toBe(4);
    expect(result.longestPackage).toBe("long");
  });

  it("handles empty input", async () => {
    const { computeStreak } = await import("../src/insights.js");
    const result = computeStreak([], now);
    expect(result).toEqual({ longestMonths: 0, currentMonths: 0, longestPackage: null });
  });
});

describe("buildInsights", () => {
  it("composes velocity, health, streak from one input shape", () => {
    const now = new Date("2026-05-07T00:00:00.000Z");
    const result = buildInsights(
      [
        {
          name: "a",
          daily: [...new Array(30).fill(5), ...new Array(30).fill(10)],
          lastActivity: "2026-05-01T00:00:00.000Z",
          publishTimestamps: ["2026-04-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"],
        },
      ],
      now,
    );
    expect(result.velocity.last30d).toBe(300);
    expect(result.health.active).toBe(1);
    expect(result.streak.currentMonths).toBe(2);
  });
});
