import type { FsCache } from "./cache.js";
import { pLimit } from "./concurrency.js";
import * as npm from "./fetchers/npm.js";
import * as github from "./fetchers/github.js";
import { RateLimitError } from "./fetchers/github.js";
import type { Package, Profile, GitHubRepo } from "./types.js";

export interface BuildProfileOptions {
  target: string;
  type: "user" | "org" | "auto";
  token: string | undefined;
  cache: FsCache | undefined;
  concurrency: number;
}

export async function buildProfile(opts: BuildProfileOptions): Promise<Profile> {
  const targetType = await resolveType(opts);
  const packageNames = await npm.listMaintainerPackages(opts.target, opts.cache);
  if (packageNames.length === 0) {
    throw new Error(`no npm packages found for "${opts.target}"`);
  }

  let githubAvailable = true;
  let githubSkipReason: string | undefined;
  const onRateLimit = (where: string) => {
    if (githubAvailable) {
      githubAvailable = false;
      githubSkipReason = `GitHub rate limit hit while fetching ${where}; set GITHUB_TOKEN for full data`;
    }
  };

  const limit = pLimit(opts.concurrency);
  type IntermediatePackage = Omit<Package, "repository"> & { _ref: npm.RepoRef | null };

  const packages: IntermediatePackage[] = await Promise.all(
    packageNames.map((name) =>
      limit(async () => {
        const info = await npm.getPackage(name, opts.cache);
        const [lastWeek, lastMonth, allTime] = await Promise.all([
          npm.getDownloadsPoint(name, "last-week", opts.cache),
          npm.getDownloadsPoint(name, "last-month", opts.cache),
          npm.getDownloadsRange(name, info.firstPublishedAt, opts.cache).catch(() => 0),
        ]);
        return {
          name: info.name,
          version: info.version,
          versionsCount: info.versionsCount,
          unpackedSize: info.unpackedSize,
          license: info.license,
          firstPublishedAt: info.firstPublishedAt,
          lastPublishedAt: info.lastPublishedAt,
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
    .map(({ _ref, ...rest }) => ({
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

  return {
    name: opts.target,
    type: targetType,
    generatedAt: new Date().toISOString(),
    packageCount: finalPackages.length,
    totals,
    packages: finalPackages,
    github: { followers, available: githubAvailable, skipReason: githubSkipReason },
  };
}

async function resolveType(opts: BuildProfileOptions): Promise<"user" | "org"> {
  if (opts.type !== "auto") return opts.type;
  const isOrg = await npm.isOrg(opts.target, opts.cache);
  return isOrg ? "org" : "user";
}
