import type { FsCache } from "../cache.js";
import { httpJson } from "./http.js";

export interface RepoRef { owner: string; repo: string; }

export interface NpmPackageInfo {
  name: string;
  version: string;
  versionsCount: number;
  unpackedSize: number | null;
  license: string | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
  repository: RepoRef | null;
}

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org";
const SEARCH_PAGE = 250;

export async function listMaintainerPackages(name: string, cache?: FsCache): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  while (true) {
    const url = `${REGISTRY}/-/v1/search?text=maintainer:${encodeURIComponent(name)}&size=${SEARCH_PAGE}&from=${from}`;
    const { body } = await httpJson<{ objects?: Array<{ package: { name: string } }>; total?: number }>(url, { cache });
    const objects = body?.objects ?? [];
    out.push(...objects.map((o) => o.package.name));
    from += objects.length;
    if (objects.length === 0 || from >= (body?.total ?? 0)) break;
  }
  return out;
}

export async function isOrg(name: string, cache?: FsCache): Promise<boolean> {
  const url = `${REGISTRY}/-/org/${encodeURIComponent(name)}/package`;
  const { status } = await httpJson(url, { cache });
  return status >= 200 && status < 300;
}

export async function listOrgPackages(name: string, cache?: FsCache): Promise<string[]> {
  const url = `${REGISTRY}/-/org/${encodeURIComponent(name)}/package`;
  const { status, body } = await httpJson<Record<string, string>>(url, { cache });
  if (status < 200 || status >= 300 || !body) return [];
  return Object.keys(body);
}

export function parseRepository(value: string | { url?: string } | undefined): RepoRef | null {
  if (!value) return null;
  const raw = typeof value === "string" ? value : value.url ?? "";
  const m = raw.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

export async function getPackage(name: string, cache?: FsCache): Promise<NpmPackageInfo> {
  const url = `${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`;
  const { body } = await httpJson<{
    name?: string;
    "dist-tags"?: { latest?: string };
    versions?: Record<string, { license?: string; dist?: { unpackedSize?: number } }>;
    time?: Record<string, string>;
    license?: string | { type?: string };
    repository?: string | { url?: string };
  } | null>(url, { cache });

  if (!body) {
    return {
      name,
      version: "0.0.0",
      versionsCount: 0,
      unpackedSize: null,
      license: null,
      firstPublishedAt: new Date(0).toISOString(),
      lastPublishedAt: new Date(0).toISOString(),
      repository: null,
    };
  }
  const versions = body.versions ?? {};
  const versionList = Object.keys(versions);
  const latest = body["dist-tags"]?.latest ?? versionList[versionList.length - 1] ?? "0.0.0";
  const time = body.time ?? {};
  const publishTimes = Object.entries(time)
    .filter(([k]) => k !== "created" && k !== "modified")
    .map(([, v]) => v)
    .sort();
  const firstPublishedAt = publishTimes[0] ?? time.created ?? new Date(0).toISOString();
  const lastPublishedAt = publishTimes[publishTimes.length - 1] ?? time.modified ?? firstPublishedAt;
  const latestMeta = versions[latest];
  const license =
    typeof body.license === "string" ? body.license :
    body.license?.type ?? latestMeta?.license ?? null;

  return {
    name: body.name ?? name,
    version: latest,
    versionsCount: versionList.length,
    unpackedSize: latestMeta?.dist?.unpackedSize ?? null,
    license,
    firstPublishedAt,
    lastPublishedAt,
    repository: parseRepository(body.repository),
  };
}

export type DownloadsPeriod = "last-week" | "last-month";

export async function getDownloadsPoint(pkg: string, period: DownloadsPeriod, cache?: FsCache): Promise<number> {
  const url = `${DOWNLOADS}/downloads/point/${period}/${encodeURIComponent(pkg)}`;
  const { status, body } = await httpJson<{ downloads?: number } | null>(url, { cache });
  if (status === 404) return 0;
  return body?.downloads ?? 0;
}

export async function getDownloadsRange(pkg: string, sinceISO: string, cache?: FsCache): Promise<number> {
  const start = new Date(sinceISO);
  const today = new Date();
  let cursor = new Date(start);
  let total = 0;
  while (cursor <= today) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setMonth(chunkEnd.getMonth() + 18);
    if (chunkEnd > today) chunkEnd.setTime(today.getTime());
    const startStr = cursor.toISOString().slice(0, 10);
    const endStr = chunkEnd.toISOString().slice(0, 10);
    const url = `${DOWNLOADS}/downloads/range/${startStr}:${endStr}/${encodeURIComponent(pkg)}`;
    const { status, body } = await httpJson<{ downloads?: Array<{ downloads: number }> } | null>(url, { cache });
    if (status >= 200 && status < 300 && body) {
      total += (body.downloads ?? []).reduce((s, d) => s + d.downloads, 0);
    }
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}
