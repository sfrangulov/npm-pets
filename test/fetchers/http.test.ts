import { describe, it, expect, vi, beforeEach } from "vitest";
import { httpJson } from "../../src/fetchers/http.js";
import { FsCache } from "../../src/cache.js";

const mockResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("httpJson", () => {
  it("returns parsed JSON on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, { ok: true }));
    const res = await httpJson("https://example.com/x");
    expect(res.body).toEqual({ ok: true });
    expect(res.status).toBe(200);
  });

  it("retries on 5xx and succeeds on third attempt", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));
    const res = await httpJson("https://example.com/x", { retries: 2, retryBaseMs: 1 });
    expect(res.body).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("returns 404 without retrying", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(404, {}));
    const res = await httpJson("https://example.com/x", { retries: 2, retryBaseMs: 1 });
    expect(res.status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("uses cache for GET when provided", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue({ status: 200, body: { cached: true }, headers: {} }),
      set: vi.fn(),
    };
    const f = vi.spyOn(globalThis, "fetch");
    const res = await httpJson("https://example.com/x", { cache: cache as unknown as FsCache });
    expect(res.body).toEqual({ cached: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("populates cache after fresh fetch", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, { fresh: true }));
    await httpJson("https://example.com/x", { cache: cache as unknown as FsCache });
    expect(cache.set).toHaveBeenCalledOnce();
  });
});
