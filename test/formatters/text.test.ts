import { describe, it, expect } from "vitest";
import { formatText } from "../../src/formatters/text.js";
import { sampleProfile, rateLimitedProfile } from "../fixtures/profile-sample.js";

describe("formatText", () => {
  it("matches snapshot for full profile", () => {
    expect(formatText(sampleProfile, 5)).toMatchSnapshot();
  });

  it("matches snapshot when GitHub data is unavailable", () => {
    expect(formatText(rateLimitedProfile, 5)).toMatchSnapshot();
  });

  it("respects top N", () => {
    const out = formatText(sampleProfile, 1);
    expect(out).toContain("chalk");
    expect(out).not.toContain("ora");
  });
});
