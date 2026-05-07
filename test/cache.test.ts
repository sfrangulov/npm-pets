import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsCache } from "../src/cache.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "npm-pets-cache-"));
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
});

describe("FsCache", () => {
  it("returns undefined on miss", async () => {
    const cache = new FsCache(dir, 60);
    expect(await cache.get("k")).toBeUndefined();
  });

  it("returns value on hit within TTL", async () => {
    const cache = new FsCache(dir, 60);
    await cache.set("k", { foo: 1 });
    expect(await cache.get("k")).toEqual({ foo: 1 });
  });

  it("returns undefined when TTL expired", async () => {
    const cache = new FsCache(dir, 0);
    await cache.set("k", { foo: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get("k")).toBeUndefined();
  });

  it("hashes long keys safely", async () => {
    const cache = new FsCache(dir, 60);
    const longKey = "https://example.com/" + "x".repeat(500);
    await cache.set(longKey, "v");
    expect(await cache.get(longKey)).toBe("v");
  });
});
