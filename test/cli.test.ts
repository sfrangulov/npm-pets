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
});
