import type { FsCache } from "../cache.js";

export interface HttpResult<T> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
  cache?: FsCache;
  cacheKey?: string;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_BASE = 300;

export async function httpJson<T = unknown>(
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResult<T>> {
  const cacheKey = opts.cacheKey ?? `GET:${url}`;
  if (opts.cache) {
    const hit = await opts.cache.get<HttpResult<T>>(cacheKey);
    if (hit) return hit;
  }

  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: opts.headers, signal: ac.signal });
      clearTimeout(timer);
      const headers = Object.fromEntries(res.headers.entries());
      // Retry on 5xx only
      if (res.status >= 500 && attempt < retries) {
        await sleep(baseMs * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      const body = (text ? JSON.parse(text) : null) as T;
      const result: HttpResult<T> = { status: res.status, body, headers };
      if (opts.cache && res.status >= 200 && res.status < 300) {
        await opts.cache.set(cacheKey, result);
      }
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await sleep(baseMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
