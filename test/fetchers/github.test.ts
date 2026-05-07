import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRepo, getContributorsCount, getUser, parseLastPage, RateLimitError } from "../../src/fetchers/github.js";

const okJson = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const errStatus = (status: number) => new Response("{}", { status });

beforeEach(() => { vi.restoreAllMocks(); });

describe("getRepo", () => {
  it("normalizes repo info", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({
      stargazers_count: 1234,
      open_issues_count: 5,
      pushed_at: "2024-01-01T00:00:00Z",
      license: { spdx_id: "MIT" },
    }));
    const repo = await getRepo({ owner: "chalk", repo: "chalk" });
    expect(repo).toEqual({
      owner: "chalk",
      repo: "chalk",
      stars: 1234,
      openIssues: 5,
      pushedAt: "2024-01-01T00:00:00Z",
      license: "MIT",
      contributors: 0,
    });
  });

  it("returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errStatus(404));
    expect(await getRepo({ owner: "x", repo: "y" })).toBeNull();
  });

  it("throws RateLimitError on 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errStatus(403));
    await expect(getRepo({ owner: "x", repo: "y" })).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("parseLastPage", () => {
  it("parses Link header", () => {
    const link = '<https://api.github.com/repos/x/y/contributors?per_page=1&page=42>; rel="last"';
    expect(parseLastPage(link)).toBe(42);
  });
  it("returns 1 when no Link header", () => {
    expect(parseLastPage(undefined)).toBe(1);
  });
});

describe("getContributorsCount", () => {
  it("returns parsed last page count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("[{}]", {
        status: 200,
        headers: {
          "content-type": "application/json",
          link: '<https://api.github.com/repos/x/y/contributors?per_page=1&page=87>; rel="last"',
        },
      }),
    );
    expect(await getContributorsCount({ owner: "x", repo: "y" })).toBe(87);
  });

  it("returns 1 when no Link header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson([{}]));
    expect(await getContributorsCount({ owner: "x", repo: "y" })).toBe(1);
  });
});

describe("getUser", () => {
  it("returns followers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({ followers: 4242 }));
    expect(await getUser("foo")).toBe(4242);
  });
  it("returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errStatus(404));
    expect(await getUser("foo")).toBeNull();
  });
});
