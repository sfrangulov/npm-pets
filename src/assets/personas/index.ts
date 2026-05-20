import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PersonaType } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const cache = new Map<string, string | null>();

const FILES: Partial<Record<PersonaType, string>> = {
  rocket: "rocket.txt",
  builder: "builder.txt",
};

export function getPersonaAscii(type: PersonaType): string | null {
  if (cache.has(type)) return cache.get(type) ?? null;
  const filename = FILES[type];
  if (!filename) {
    cache.set(type, null);
    return null;
  }
  // tsup bundles the loader into dist/cli.js, so __dirname is dist/ at runtime.
  // In tests/dev (running TS sources), __dirname is src/assets/personas/.
  const candidates = [
    join(__dirname, filename),                                       // src/assets/personas/<file> (tests, tsx)
    join(__dirname, "assets", "personas", filename),                 // dist/assets/personas/<file> (built bundle)
    join(__dirname, "..", "src", "assets", "personas", filename),    // dist/ → ../src/assets/personas/<file>
  ];
  for (const path of candidates) {
    try {
      const content = readFileSync(path, "utf8").replace(/\s+$/, "");
      cache.set(type, content);
      return content;
    } catch { /* try next */ }
  }
  cache.set(type, null);
  return null;
}
