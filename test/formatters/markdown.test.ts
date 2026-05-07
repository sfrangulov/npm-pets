import { describe, it, expect } from "vitest";
import { formatMarkdown } from "../../src/formatters/markdown.js";
import { sampleProfile, rateLimitedProfile } from "../fixtures/profile-sample.js";

describe("formatMarkdown", () => {
  it("matches snapshot for full profile", () => {
    expect(formatMarkdown(sampleProfile, 5)).toMatchSnapshot();
  });

  it("matches snapshot when GitHub data is unavailable", () => {
    expect(formatMarkdown(rateLimitedProfile, 5)).toMatchSnapshot();
  });
});
