import type { Profile } from "../../src/types.js";

export const sampleProfile: Profile = {
  name: "sindresorhus",
  type: "user",
  generatedAt: "2026-05-07T12:00:00.000Z",
  packageCount: 2,
  totals: {
    downloadsLastWeek: 50_000_000,
    downloadsLastMonth: 200_000_000,
    downloadsAllTime: 9_000_000_000,
    githubStars: 27_000,
  },
  packages: [
    {
      name: "chalk",
      version: "5.3.0",
      versionsCount: 50,
      unpackedSize: 5000,
      license: "MIT",
      firstPublishedAt: "2013-01-01T00:00:00.000Z",
      lastPublishedAt: "2024-01-01T00:00:00.000Z",
      downloads: { lastWeek: 42_000_000, lastMonth: 180_000_000, allTime: 8_500_000_000, allTimePartial: false },
      repository: {
        owner: "chalk",
        repo: "chalk",
        stars: 22_000,
        openIssues: 4,
        pushedAt: "2024-01-01T00:00:00.000Z",
        contributors: 150,
        license: "MIT",
      },
    },
    {
      name: "ora",
      version: "8.0.1",
      versionsCount: 30,
      unpackedSize: 3000,
      license: "MIT",
      firstPublishedAt: "2015-06-01T00:00:00.000Z",
      lastPublishedAt: "2024-02-01T00:00:00.000Z",
      downloads: { lastWeek: 8_000_000, lastMonth: 20_000_000, allTime: 500_000_000, allTimePartial: false },
      repository: {
        owner: "sindresorhus",
        repo: "ora",
        stars: 5_000,
        openIssues: 12,
        pushedAt: "2024-02-01T00:00:00.000Z",
        contributors: 60,
        license: "MIT",
      },
    },
  ],
  github: { followers: 60_000, available: true },
};

export const rateLimitedProfile: Profile = {
  ...sampleProfile,
  github: { followers: null, available: false, skipReason: "GitHub rate limit hit; set GITHUB_TOKEN for full data" },
  totals: { ...sampleProfile.totals, githubStars: 0 },
  packages: sampleProfile.packages.map((p) => ({ ...p, repository: null })),
};
