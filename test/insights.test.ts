import { describe, it, expect } from "vitest";
import { computeVelocity } from "../src/insights.js";

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
