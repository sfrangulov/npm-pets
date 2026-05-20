import type { FsCache } from "./cache.js";
import { pLimit } from "./concurrency.js";
import * as npm from "./fetchers/npm.js";
import * as github from "./fetchers/github.js";
import { RateLimitError } from "./fetchers/github.js";
import type { Package, Profile, GitHubRepo } from "./types.js";
import { buildInsights } from "./insights.js";
import { detectPersona } from "./persona.js";

export interface BuildProfileOptions {
  target: string;
  type: "user" | "org" | "auto";
  token: string | undefined;
  cache: FsCache | undefined;
  concurrency: number;
  onProgress?: (stage: string) => void;
}

export async function buildProfile(opts: BuildProfileOptions): Promise<Profile> {
  const report = (s: string) => opts.onProgress?.(s);

  report(`🐾 sniffing npm registry for "${opts.target}"...`);
  const { type: targetType, packageNames } = await listAndDetect(opts);
  if (packageNames.length === 0) {
    throw new Error(`no npm packages found for "${opts.target}"`);
  }
  report(`🦴 dug up ${packageNames.length} ${targetType} packages`);

  let githubAvailable = true;
  let githubSkipReason: string | undefined;
  const onRateLimit = (where: string) => {
    if (githubAvailable) {
      githubAvailable = false;
      githubSkipReason = `GitHub rate limit hit while fetching ${where}; set GITHUB_TOKEN for full data`;
    }
  };

  const limit = pLimit(opts.concurrency);
  type IntermediatePackage = Omit<Package, "repository"> & {
    _ref: npm.RepoRef | null;
    publishTimestamps: string[];
    daily: number[];
  };

  let pkgDone = 0;
  const total = packageNames.length;
  report(`📦 unboxing pkg 0 of ${total}...`);

  const packages: IntermediatePackage[] = await Promise.all(
    packageNames.map((name) =>
      limit(async () => {
        const info = await npm.getPackage(name, opts.cache);
        const [lastWeek, lastMonth, allTime, daily] = await Promise.all([
          npm.getDownloadsPoint(name, "last-week", opts.cache),
          npm.getDownloadsPoint(name, "last-month", opts.cache),
          npm.getDownloadsRange(name, info.firstPublishedAt, opts.cache).catch(() => 0),
          npm.getDownloadsDaily(name, 60, opts.cache).catch(() => new Array(60).fill(0) as number[]),
        ]);
        pkgDone++;
        report(`📦 unboxing pkg ${pkgDone} of ${total}...`);
        return {
          name: info.name,
          version: info.version,
          versionsCount: info.versionsCount,
          unpackedSize: info.unpackedSize,
          license: info.license,
          firstPublishedAt: info.firstPublishedAt,
          lastPublishedAt: info.lastPublishedAt,
          publishTimestamps: info.publishTimestamps,
          daily,
          downloads: { lastWeek, lastMonth, allTime, allTimePartial: allTime === 0 && lastMonth > 0 },
          _ref: info.repository,
        };
      }),
    ),
  );

  // Deduplicated GitHub fetches
  const refMap = new Map<string, npm.RepoRef>();
  for (const pkg of packages) {
    if (pkg._ref) refMap.set(`${pkg._ref.owner}/${pkg._ref.repo}`, pkg._ref);
  }

  const repoData = new Map<string, GitHubRepo>();
  if (githubAvailable) {
    let ghDone = 0;
    const ghTotal = refMap.size;
    report(`⭐ counting stars (0/${ghTotal})...`);
    await Promise.all(
      Array.from(refMap.values()).map((ref) =>
        limit(async () => {
          if (!githubAvailable) return;
          try {
            const repo = await github.getRepo(ref, { token: opts.token, cache: opts.cache });
            if (repo) {
              const contributors = await github
                .getContributorsCount(ref, { token: opts.token, cache: opts.cache })
                .catch((e: unknown) => {
                  if (e instanceof RateLimitError) onRateLimit("contributors");
                  return 0;
                });
              repoData.set(`${ref.owner}/${ref.repo}`, { ...repo, contributors });
            }
          } catch (e) {
            if (e instanceof RateLimitError) onRateLimit("repo info");
          }
          ghDone++;
          report(`⭐ counting stars (${ghDone}/${ghTotal})...`);
        }),
      ),
    );
  }

  let followers: number | null = null;
  if (githubAvailable) {
    try {
      followers = await github.getUser(opts.target, { token: opts.token, cache: opts.cache });
    } catch (e) {
      if (e instanceof RateLimitError) onRateLimit("user followers");
    }
  }

  const finalPackages: Package[] = packages
    .map(({ _ref, publishTimestamps: _pt, daily: _d, ...rest }) => ({
      ...rest,
      repository: _ref ? repoData.get(`${_ref.owner}/${_ref.repo}`) ?? null : null,
    }))
    .sort((a, b) => b.downloads.lastMonth - a.downloads.lastMonth);

  const totals = finalPackages.reduce(
    (acc, p) => {
      acc.downloadsLastWeek += p.downloads.lastWeek;
      acc.downloadsLastMonth += p.downloads.lastMonth;
      acc.downloadsAllTime += p.downloads.allTime;
      acc.githubStars += p.repository?.stars ?? 0;
      return acc;
    },
    { downloadsLastWeek: 0, downloadsLastMonth: 0, downloadsAllTime: 0, githubStars: 0 },
  );

  const insights = buildInsights(
    packages.map((p) => {
      const lastActivity =
        (p._ref ? repoData.get(`${p._ref.owner}/${p._ref.repo}`)?.pushedAt : undefined) ??
        p.lastPublishedAt;
      return {
        name: p.name,
        daily: p.daily,
        lastActivity,
        publishTimestamps: p.publishTimestamps,
      };
    }),
  );

  const profile: Profile = {
    name: opts.target,
    type: targetType,
    generatedAt: new Date().toISOString(),
    packageCount: finalPackages.length,
    totals,
    packages: finalPackages,
    github: { followers, available: githubAvailable, skipReason: githubSkipReason },
    insights,
    persona: { type: "builder", label: "", emoji: "", description: "" },
  };
  profile.persona = detectPersona(profile);
  return profile;
}

async function listAndDetect(
  opts: BuildProfileOptions,
): Promise<{ type: "user" | "org"; packageNames: string[] }> {
  if (opts.type === "user") {
    return { type: "user", packageNames: await npm.listMaintainerPackages(opts.target, opts.cache) };
  }
  if (opts.type === "org") {
    return { type: "org", packageNames: await npm.listOrgPackages(opts.target, opts.cache) };
  }
  // auto: prefer user (maintainer search) — if no results, fall back to org packages
  const [userPkgs, orgPkgs] = await Promise.all([
    npm.listMaintainerPackages(opts.target, opts.cache),
    npm.listOrgPackages(opts.target, opts.cache),
  ]);
  if (userPkgs.length > 0) return { type: "user", packageNames: userPkgs };
  if (orgPkgs.length > 0) return { type: "org", packageNames: orgPkgs };
  return { type: "user", packageNames: [] };
}
