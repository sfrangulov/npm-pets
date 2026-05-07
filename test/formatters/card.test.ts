import { describe, it, expect } from "vitest";
import { formatCard } from "../../src/formatters/card.js";
import { sampleProfile } from "../fixtures/profile-sample.js";

describe("formatCard", () => {
  it("returns an SVG string of correct dimensions", async () => {
    const svg = await formatCard(sampleProfile, 3);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it("includes profile name and persona label", async () => {
    const svg = await formatCard(sampleProfile, 3);
    expect(svg).toContain("sindresorhus");
    expect(svg).toContain(sampleProfile.persona.label);
  });

  it("includes top package names up to limit", async () => {
    const svg = await formatCard(sampleProfile, 1);
    expect(svg).toContain("chalk");
    expect(svg).not.toContain("ora");
  });
});
