import { describe, it, expect } from "vitest";
import { formatJson } from "../../src/formatters/json.js";
import { sampleProfile } from "../fixtures/profile-sample.js";

describe("formatJson", () => {
  it("returns pretty-printed JSON parseable back to the input", () => {
    const out = formatJson(sampleProfile);
    expect(JSON.parse(out)).toEqual(sampleProfile);
    expect(out.includes("\n")).toBe(true);
  });
});
