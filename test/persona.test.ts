import { describe, it, expect } from "vitest";
import { detectPersona } from "../src/persona.js";
import type { Profile } from "../src/types.js";

const baseProfile = (): Profile => ({
  name: "u",
  type: "user",
  generatedAt: "2026-05-07T00:00:00.000Z",
  packageCount: 3,
  totals: { downloadsLastWeek: 100, downloadsLastMonth: 400, downloadsAllTime: 5000, githubStars: 10 },
  packages: [
    {
      name: "p1", version: "1.0.0", versionsCount: 5, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2024-01-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 80, lastMonth: 300, allTime: 4000, allTimePartial: false },
      repository: null,
    },
    {
      name: "p2", version: "1.0.0", versionsCount: 3, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2024-06-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 15, lastMonth: 80, allTime: 800, allTimePartial: false },
      repository: null,
    },
    {
      name: "p3", version: "1.0.0", versionsCount: 1, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2025-01-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 5, lastMonth: 20, allTime: 200, allTimePartial: false },
      repository: null,
    },
  ],
  github: { followers: 0, available: true },
  insights: {
    velocity: { last30d: 0, prev30d: 0, deltaPct: 0, topGrowing: [] },
    health: { active: 0, sleeping: 0, dormant: 3, perPackage: { p1: "dormant", p2: "dormant", p3: "dormant" } },
    streak: { longestMonths: 0, currentMonths: 0, longestPackage: null },
  },
  persona: { type: "builder", label: "The Builder", emoji: "🛠️", description: "" },
});

function mkRepo(language: string) {
  return {
    owner: "x", repo: "y", stars: 0, openIssues: 0,
    pushedAt: "2026-01-01T00:00:00.000Z",
    contributors: 0, license: null, language,
  };
}

describe("detectPersona", () => {
  it("rocket when velocity.deltaPct > 50", () => {
    const p = baseProfile();
    p.insights.velocity.deltaPct = 75;
    expect(detectPersona(p).type).toBe("rocket");
  });

  it("streaker when currentMonths >= 12", () => {
    const p = baseProfile();
    p.insights.streak.currentMonths = 12;
    expect(detectPersona(p).type).toBe("streaker");
  });

  it("one-hit-wonder when top package is >= 80% of all-time", () => {
    const p = baseProfile();
    expect(detectPersona(p).type).toBe("one-hit-wonder");
  });

  it("polyglot when >= 4 distinct repo languages", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 2000;
    p.packages[2]!.downloads.allTime = 1000;
    p.totals.downloadsAllTime = 5000;
    p.packages[0]!.repository = mkRepo("TypeScript");
    p.packages[1]!.repository = mkRepo("Rust");
    p.packages[2]!.repository = mkRepo("Go");
    p.packages.push({
      ...p.packages[0]!,
      name: "p4",
      repository: mkRepo("Python"),
      downloads: { lastWeek: 0, lastMonth: 0, allTime: 0, allTimePartial: false },
    });
    expect(detectPersona(p).type).toBe("polyglot");
  });

  it("veteran when oldest package > 5 years and >= 5 packages", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    for (let i = 4; i <= 5; i++) {
      p.packages.push({
        ...p.packages[0]!, name: `p${i}`,
        firstPublishedAt: "2020-01-01T00:00:00.000Z",
      });
    }
    p.packageCount = p.packages.length;
    p.packages[0]!.firstPublishedAt = "2020-01-01T00:00:00.000Z";
    expect(detectPersona(p, new Date("2026-05-07T00:00:00.000Z")).type).toBe("veteran");
  });

  it("active-maintainer when >= 60% of packages active", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    p.insights.health = {
      active: 2, sleeping: 1, dormant: 0,
      perPackage: { p1: "active", p2: "active", p3: "sleeping" },
    };
    expect(detectPersona(p).type).toBe("active-maintainer");
  });

  it("builder fallback otherwise", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    expect(detectPersona(p).type).toBe("builder");
  });
});
