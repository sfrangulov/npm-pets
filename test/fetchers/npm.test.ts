import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  listMaintainerPackages,
  isOrg,
  getPackage,
  getDownloadsPoint,
  getDownloadsRange,
  parseRepository,
} from "../../src/fetchers/npm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFile(join(__dirname, "..", "fixtures", name), "utf8").then(JSON.parse);

const okJson = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const notFound = () => new Response("{}", { status: 404 });

beforeEach(() => { vi.restoreAllMocks(); });

describe("listMaintainerPackages", () => {
  it("paginates through search results", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ objects: [{ package: { name: "a" } }, { package: { name: "b" } }], total: 3 }))
      .mockResolvedValueOnce(okJson({ objects: [{ package: { name: "c" } }], total: 3 }));
    const names = await listMaintainerPackages("alice");
    expect(names).toEqual(["a", "b", "c"]);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("isOrg", () => {
  it("returns true on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    expect(await isOrg("vercel")).toBe(true);
  });
  it("returns false on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(notFound());
    expect(await isOrg("nope")).toBe(false);
  });
});

describe("getPackage", () => {
  it("normalizes package metadata", async () => {
    const data = await fixture("npm-package-chalk.json");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson(data));
    const pkg = await getPackage("chalk");
    expect(pkg.name).toBe("chalk");
    expect(pkg.version).toBe("5.3.0");
    expect(pkg.versionsCount).toBe(2);
    expect(pkg.unpackedSize).toBe(5000);
    expect(pkg.license).toBe("MIT");
    expect(pkg.firstPublishedAt).toBe("2013-01-01T00:00:00.000Z");
    expect(pkg.lastPublishedAt).toBe("2023-09-01T00:00:00.000Z");
    expect(pkg.repository).toEqual({ owner: "chalk", repo: "chalk" });
  });
  it("getPackage returns sorted publishTimestamps from time map", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({
        name: "x",
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": {}, "0.1.0": {} },
        time: {
          created: "2020-01-01T00:00:00.000Z",
          modified: "2024-06-01T00:00:00.000Z",
          "0.1.0": "2020-01-15T00:00:00.000Z",
          "1.0.0": "2024-05-01T00:00:00.000Z",
        },
      }), { status: 200 }),
    );
    const info = await getPackage("x");
    expect(info.publishTimestamps).toEqual([
      "2020-01-15T00:00:00.000Z",
      "2024-05-01T00:00:00.000Z",
    ]);
  });
});

describe("getDownloadsPoint", () => {
  it("returns downloads count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({ downloads: 42_000_000 }));
    expect(await getDownloadsPoint("chalk", "last-month")).toBe(42_000_000);
  });
  it("returns 0 on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(notFound());
    expect(await getDownloadsPoint("chalk", "last-month")).toBe(0);
  });
});

describe("getDownloadsRange (all-time)", () => {
  it("aggregates across 18-month chunks", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const m = url.match(/range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})/);
      const downloads = m ? Array.from({ length: 5 }, (_, i) => ({ downloads: 100 + i, day: "" })) : [];
      return okJson({ downloads });
    });
    const total = await getDownloadsRange("chalk", "2020-01-01");
    expect(total).toBeGreaterThan(0);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("parseRepository", () => {
  it("parses git+https", () => {
    expect(parseRepository("git+https://github.com/chalk/chalk.git")).toEqual({ owner: "chalk", repo: "chalk" });
  });
  it("parses git://", () => {
    expect(parseRepository("git://github.com/foo/bar.git")).toEqual({ owner: "foo", repo: "bar" });
  });
  it("returns null for non-github", () => {
    expect(parseRepository("https://gitlab.com/foo/bar")).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(parseRepository(undefined)).toBeNull();
  });
});
