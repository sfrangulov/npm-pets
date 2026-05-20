import { describe, it, expect } from "vitest";
import { formatCard } from "../../src/formatters/card.js";
import { sampleProfile } from "../fixtures/profile-sample.js";
import { getPersonaAscii } from "../../src/assets/personas/index.js";

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
    // satori splits multi-word strings across <text> elements; check both words.
    expect(svg).toContain("The");
    expect(svg).toContain("Builder");
  });

  it("includes persona description as subtitle", async () => {
    const svg = await formatCard(sampleProfile, 3);
    expect(svg).toContain("Quietly");
    expect(svg).toContain("shipping");
  });

  it("loads ASCII assets for Rocket and Builder personas only", () => {
    expect(getPersonaAscii("rocket")).toMatch(/\^\^\^\^\^\^/);
    expect(getPersonaAscii("builder")).toMatch(/_____/);
    expect(getPersonaAscii("polyglot")).toBeNull();
    expect(getPersonaAscii("veteran")).toBeNull();
  });

  it("card SVG grows when persona has ASCII art (Builder vs Polyglot)", async () => {
    // Satori splits multi-line monospace text per glyph, so direct substring checks are
    // fragile. Compare SVG payload sizes instead: ASCII adds dozens of <text> elements.
    const polyglotProfile = {
      ...sampleProfile,
      persona: { type: "polyglot" as const, label: "The Polyglot", emoji: "🧬", description: "Shipping across many languages" },
    };
    const svgWithAscii = await formatCard(sampleProfile, 3);          // builder
    const svgWithoutAscii = await formatCard(polyglotProfile, 3);
    expect(svgWithAscii.length).toBeGreaterThan(svgWithoutAscii.length + 1000);
  });

  it("includes top package names up to limit", async () => {
    const svg = await formatCard(sampleProfile, 1);
    expect(svg).toContain("chalk");
    expect(svg).not.toContain("ora");
  });
});
