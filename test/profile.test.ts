import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildProfile } from "../src/profile.js";
import * as npm from "../src/fetchers/npm.js";
import * as github from "../src/fetchers/github.js";

beforeEach(() => { vi.restoreAllMocks(); });

describe("buildProfile", () => {
  it("assembles a profile with npm + github data", async () => {
    vi.spyOn(npm, "listOrgPackages").mockResolvedValue([]);
    vi.spyOn(npm, "listMaintainerPackages").mockResolvedValue(["chalk"]);
    vi.spyOn(npm, "getPackage").mockResolvedValue({
      name: "chalk",
      version: "5.3.0",
      versionsCount: 50,
      unpackedSize: 5000,
      license: "MIT",
      firstPublishedAt: "2013-01-01T00:00:00Z",
      lastPublishedAt: "2024-01-01T00:00:00Z",
      publishTimestamps: [],
      repository: { owner: "chalk", repo: "chalk" },
    });
    vi.spyOn(npm, "getDownloadsPoint").mockImplementation(async (_p, period) =>
      period === "last-week" ? 10_000_000 : 42_000_000,
    );
    vi.spyOn(npm, "getDownloadsRange").mockResolvedValue(900_000_000);
    vi.spyOn(npm, "getDownloadsDaily").mockResolvedValue(new Array(60).fill(0));
    vi.spyOn(github, "getRepo").mockResolvedValue({
      owner: "chalk",
      repo: "chalk",
      stars: 22000,
      openIssues: 4,
      pushedAt: "2024-01-01T00:00:00Z",
      contributors: 0,
      license: "MIT",
      language: null,
    });
    vi.spyOn(github, "getContributorsCount").mockResolvedValue(150);
    vi.spyOn(github, "getUser").mockResolvedValue(50000);

    const profile = await buildProfile({
      target: "sindresorhus",
      type: "auto",
      token: "tkn",
      cache: undefined,
      concurrency: 4,
    });

    expect(profile.name).toBe("sindresorhus");
    expect(profile.type).toBe("user");
    expect(profile.packageCount).toBe(1);
    expect(profile.totals.downloadsLastMonth).toBe(42_000_000);
    expect(profile.totals.downloadsAllTime).toBe(900_000_000);
    expect(profile.totals.githubStars).toBe(22000);
    expect(profile.github.followers).toBe(50000);
    expect(profile.github.available).toBe(true);
    expect(profile.packages[0]!.repository?.contributors).toBe(150);
  });

  it("degrades gracefully on GitHub rate limit", async () => {
    vi.spyOn(npm, "listOrgPackages").mockResolvedValue([]);
    vi.spyOn(npm, "listMaintainerPackages").mockResolvedValue(["chalk"]);
    vi.spyOn(npm, "getPackage").mockResolvedValue({
      name: "chalk",
      version: "5.3.0",
      versionsCount: 1,
      unpackedSize: null,
      license: "MIT",
      firstPublishedAt: "2024-01-01T00:00:00Z",
      lastPublishedAt: "2024-01-01T00:00:00Z",
      publishTimestamps: [],
      repository: { owner: "chalk", repo: "chalk" },
    });
    vi.spyOn(npm, "getDownloadsPoint").mockResolvedValue(1);
    vi.spyOn(npm, "getDownloadsRange").mockResolvedValue(1);
    vi.spyOn(npm, "getDownloadsDaily").mockResolvedValue(new Array(60).fill(0));
    vi.spyOn(github, "getRepo").mockRejectedValue(new github.RateLimitError());
    vi.spyOn(github, "getUser").mockRejectedValue(new github.RateLimitError());

    const profile = await buildProfile({
      target: "alice",
      type: "auto",
      token: undefined,
      cache: undefined,
      concurrency: 4,
    });

    expect(profile.github.available).toBe(false);
    expect(profile.github.skipReason).toMatch(/rate limit/i);
    expect(profile.packages[0]!.repository).toBeNull();
    expect(profile.totals.githubStars).toBe(0);
  });

  it("throws when target has no packages", async () => {
    vi.spyOn(npm, "listOrgPackages").mockResolvedValue([]);
    vi.spyOn(npm, "listMaintainerPackages").mockResolvedValue([]);
    await expect(
      buildProfile({ target: "ghost", type: "auto", token: undefined, cache: undefined, concurrency: 4 }),
    ).rejects.toThrow(/no npm packages found/i);
  });
});
