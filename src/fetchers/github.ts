import type { FsCache } from "../cache.js";
import type { GitHubRepo } from "../types.js";
import { httpJson } from "./http.js";

const API = "https://api.github.com";

export class RateLimitError extends Error {
  constructor() {
    super("GitHub rate limit hit");
    this.name = "RateLimitError";
  }
}

interface Ctx {
  token?: string;
  cache?: FsCache;
}

const headers = (token?: string): Record<string, string> => ({
  accept: "application/vnd.github+json",
  "user-agent": "npm-pets",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

export interface RepoRef { owner: string; repo: string; }

export async function getRepo(ref: RepoRef, ctx: Ctx = {}): Promise<GitHubRepo | null> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}`;
  const { status, body } = await httpJson<{
    stargazers_count: number;
    open_issues_count: number;
    pushed_at: string;
    license: { spdx_id?: string } | null;
  }>(url, { headers: headers(ctx.token), cache: ctx.cache });

  if (status === 404) return null;
  if (status === 403 || status === 429) throw new RateLimitError();
  if (status < 200 || status >= 300) return null;

  return {
    owner: ref.owner,
    repo: ref.repo,
    stars: body.stargazers_count,
    openIssues: body.open_issues_count,
    pushedAt: body.pushed_at,
    contributors: 0,
    license: body.license?.spdx_id ?? null,
  };
}

export function parseLastPage(linkHeader: string | undefined): number {
  if (!linkHeader) return 1;
  const m = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return m ? parseInt(m[1]!, 10) : 1;
}

export async function getContributorsCount(ref: RepoRef, ctx: Ctx = {}): Promise<number> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contributors?per_page=1&anon=1`;
  const { status, headers: resHeaders } = await httpJson<unknown>(url, {
    headers: headers(ctx.token),
    cache: ctx.cache,
  });
  if (status === 403 || status === 429) throw new RateLimitError();
  if (status < 200 || status >= 300) return 0;
  return parseLastPage(resHeaders.link);
}

export async function getUser(login: string, ctx: Ctx = {}): Promise<number | null> {
  const url = `${API}/users/${login}`;
  const { status, body } = await httpJson<{ followers: number }>(url, {
    headers: headers(ctx.token),
    cache: ctx.cache,
  });
  if (status === 404) return null;
  if (status === 403 || status === 429) throw new RateLimitError();
  if (status < 200 || status >= 300) return null;
  return body.followers;
}
