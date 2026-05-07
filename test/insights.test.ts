import { describe, it, expect } from "vitest";
import { computeVelocity, computeHealth } from "../src/insights.js";

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
