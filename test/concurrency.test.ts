import { describe, it, expect } from "vitest";
import { pLimit } from "../src/concurrency.js";

describe("pLimit", () => {
  it("limits concurrent execution to N", async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 6 }, () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
      }),
    );
    await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns task results in input order via Promise.all", async () => {
    const limit = pLimit(3);
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => limit(async () => n * 2)),
    );
    expect(results).toEqual([2, 4, 6, 8]);
  });
});
