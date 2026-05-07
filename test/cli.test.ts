import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCli } from "../src/cli.js";
import * as profileModule from "../src/profile.js";
import { sampleProfile } from "./fixtures/profile-sample.js";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.FORCE_COLOR = "0";
  process.env.NO_COLOR = "1";
  delete process.env.GITHUB_TOKEN;
});

describe("runCli", () => {
  it("runs profile and writes pretty output to stdout", async () => {
    vi.spyOn(profileModule, "buildProfile").mockResolvedValue(sampleProfile);
    let captured = "";
    const code = await runCli(["sindresorhus"], (s) => {
      captured += s;
    });
    expect(code).toBe(0);
    expect(captured).toContain("sindresorhus");
  });

  it("emits JSON when --format json", async () => {
    vi.spyOn(profileModule, "buildProfile").mockResolvedValue(sampleProfile);
    let captured = "";
    const code = await runCli(["sindresorhus", "--format", "json"], (s) => {
      captured += s;
    });
    expect(code).toBe(0);
    expect(JSON.parse(captured.trim())).toEqual(sampleProfile);
  });

  it("returns exit code 1 with friendly message when target has no packages", async () => {
    vi.spyOn(profileModule, "buildProfile").mockRejectedValue(new Error('no npm packages found for "ghost"'));
    const errs: string[] = [];
    const code = await runCli(["ghost"], () => {}, (s) => errs.push(s));
    expect(code).toBe(1);
    expect(errs.join("")).toMatch(/no npm packages found/);
  });

  it("uses GITHUB_TOKEN env var when --token not provided", async () => {
    process.env.GITHUB_TOKEN = "env-token";
    const spy = vi.spyOn(profileModule, "buildProfile").mockResolvedValue(sampleProfile);
    await runCli(["alice"], () => {});
    expect(spy.mock.calls[0]![0]!.token).toBe("env-token");
  });

  it("--token flag overrides env var", async () => {
    process.env.GITHUB_TOKEN = "env-token";
    const spy = vi.spyOn(profileModule, "buildProfile").mockResolvedValue(sampleProfile);
    await runCli(["alice", "--token", "flag-token"], () => {});
    expect(spy.mock.calls[0]![0]!.token).toBe("flag-token");
  });

  it("--export writes a non-empty PNG to the given path", async () => {
    const { existsSync, readFileSync, rmSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = mkdtempSync(join(tmpdir(), "npm-pets-test-"));
    const out = join(dir, "card.png");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/-/v1/search")) return new Response(JSON.stringify({ objects: [{ package: { name: "x" } }], total: 1 }), { status: 200 }) as unknown as Response;
      if (u.includes("/-/org/")) return new Response("not found", { status: 404 }) as unknown as Response;
      if (u.includes("/downloads/point/")) return new Response(JSON.stringify({ downloads: 1 }), { status: 200 }) as unknown as Response;
      if (u.includes("/downloads/range/")) return new Response(JSON.stringify({ downloads: [] }), { status: 200 }) as unknown as Response;
      if (u.includes("registry.npmjs.org/")) return new Response(JSON.stringify({
        name: "x", "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": {} },
        time: { "1.0.0": "2026-04-01T00:00:00.000Z" },
      }), { status: 200 }) as unknown as Response;
      if (u.includes("api.github.com")) return new Response("nope", { status: 404 }) as unknown as Response;
      return new Response("nope", { status: 404 }) as unknown as Response;
    });

    const code = await runCli(["x", "--export", out, "--no-cache"]);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const bytes = readFileSync(out);
    expect(bytes.length).toBeGreaterThan(1000);
    // PNG magic bytes: 89 50 4E 47
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);
});
