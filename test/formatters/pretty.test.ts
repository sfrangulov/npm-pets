import { describe, it, expect, beforeEach } from "vitest";
import { formatPretty } from "../../src/formatters/pretty.js";
import { sampleProfile, rateLimitedProfile } from "../fixtures/profile-sample.js";

beforeEach(() => {
  process.env.FORCE_COLOR = "0";
  process.env.NO_COLOR = "1";
});

describe("formatPretty", () => {
  it("includes name in figlet header", () => {
    const out = formatPretty(sampleProfile, 5, "Standard");
    expect(out).toContain("sindresorhus");
  });

  it("renders three-column download summary", () => {
    const out = formatPretty(sampleProfile, 5, "Standard");
    expect(out).toMatch(/last week/i);
    expect(out).toMatch(/last month/i);
    expect(out).toMatch(/all time/i);
  });

  it("renders top-N table with package names", () => {
    const out = formatPretty(sampleProfile, 5, "Standard");
    expect(out).toContain("chalk");
    expect(out).toContain("ora");
  });

  it("shows GitHub-unavailable notice when applicable", () => {
    const out = formatPretty(rateLimitedProfile, 5, "Standard");
    expect(out.toLowerCase()).toContain("github");
    expect(out.toLowerCase()).toContain("unavailable");
  });

  it("respects top N", () => {
    const out = formatPretty(sampleProfile, 1, "Standard");
    expect(out).toContain("chalk");
    expect(out).not.toContain("ora");
  });
});
