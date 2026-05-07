# Card + Persona (v0.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tweet-ready 1200×630 card (`--format card` for SVG, `--export file.png` for PNG) plus a Persona detector that picks one of seven archetypes from the profile.

**Architecture:** Persona is a pure function over `Profile` — output goes onto `Profile.persona` so all formatters (incl. JSON) see it. The card renderer uses `satori` (JSX-element → SVG) and `@resvg/resvg-js` (SVG → PNG). Both are lazy-imported so users on `--format json` don't pay startup cost. Layout is composed as plain VNode objects (no JSX, no React dep). Inter Regular + Bold are bundled in `assets/fonts/` and copied to `dist/` by tsup.

**Tech Stack:** TypeScript ESM, native fetch, vitest, satori, @resvg/resvg-js, no React.

**Spec:** `docs/specs/2026-05-07-wow-features-roadmap.md` § 5.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | modify | Add `satori`, `@resvg/resvg-js`. Bump version. |
| `tsup.config.ts` | modify | Copy `assets/fonts/` to `dist/assets/fonts/` |
| `assets/fonts/Inter-Regular.ttf` | create | Bundled font (Regular) |
| `assets/fonts/Inter-Bold.ttf` | create | Bundled font (Bold) |
| `src/fetchers/github.ts` | modify | Capture `language` field |
| `src/types.ts` | modify | Add `language` to `GitHubRepo`. Add `Persona`, `PersonaInfo`. Add `persona: PersonaInfo` to `Profile`. |
| `src/persona.ts` | create | `detectPersona(profile): PersonaInfo` — pure rules engine |
| `src/profile.ts` | modify | Call `detectPersona` after building Profile, attach to result |
| `src/formatters/index.ts` | modify | Add `card` to Format union; make dispatcher async; route card to `formatCard` |
| `src/formatters/card.ts` | create | `formatCard(profile, top): Promise<string>` — VNode → satori → SVG |
| `src/cli.ts` | modify | Add `--export <file>` flag; if set, render card → PNG via resvg → write file |
| `test/persona.test.ts` | create | Unit tests for each rule |
| `test/formatters/card.test.ts` | create | Snapshot/contains tests for SVG output |
| `test/fixtures/profile-sample.ts` | modify | Extend with realistic `persona` + `language` per repo |
| `test/profile.test.ts` | modify | Update fixture/mock expectations |
| `test/formatters/json.test.ts` | modify | Assert persona in JSON output |
| `test/cli.test.ts` | modify | Test `--export` writes a non-empty PNG file |

---

## Task 1: Install deps, bundle fonts, configure tsup

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Create: `assets/fonts/Inter-Regular.ttf`
- Create: `assets/fonts/Inter-Bold.ttf`
- Create: `assets/fonts/LICENSE.txt`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/sergeifrangulov/projects/pets/npm-pets
npm install satori @resvg/resvg-js
```

Expected: both packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Download Inter fonts to `assets/fonts/`**

```bash
mkdir -p assets/fonts
curl -fsSL -o assets/fonts/Inter-Regular.ttf https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Regular.ttf
curl -fsSL -o assets/fonts/Inter-Bold.ttf https://github.com/rsms/inter/raw/v4.0/docs/font-files/Inter-Bold.ttf
```

Verify both files are non-empty (`ls -la assets/fonts/` — each should be ~300KB).

If those URLs fail, the canonical alternative is the Inter releases page on GitHub (`rsms/inter` repo, releases v4.0 → `Inter-4.0.zip` → extract `Inter-Regular.ttf` and `Inter-Bold.ttf`). Do whatever puts the two TTFs at the paths above.

- [ ] **Step 3: Add license attribution**

Create `assets/fonts/LICENSE.txt` with:
```
Inter font by Rasmus Andersson (rsms.me/inter), licensed under the SIL Open Font License 1.1.
Source: https://github.com/rsms/inter
```

- [ ] **Step 4: Configure tsup to copy fonts**

Replace `tsup.config.ts` with:

```ts
import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  shims: false,
  onSuccess: async () => {
    const dest = join("dist", "assets", "fonts");
    mkdirSync(dest, { recursive: true });
    copyFileSync(join("assets", "fonts", "Inter-Regular.ttf"), join(dest, "Inter-Regular.ttf"));
    copyFileSync(join("assets", "fonts", "Inter-Bold.ttf"), join(dest, "Inter-Bold.ttf"));
    copyFileSync(join("assets", "fonts", "LICENSE.txt"), join(dest, "LICENSE.txt"));
  },
});
```

- [ ] **Step 5: Update `package.json` `files` field to include `assets/`**

Find the `"files": [...]` entry and ensure it includes `"dist"` AND `"assets"`. Example:

```json
"files": [
  "dist",
  "assets",
  "README.md"
]
```

The published npm package needs both `dist/` (with the copied fonts) and the original `assets/` (so `import.meta.url`-based loading works whether you run from source or dist).

- [ ] **Step 6: Verify build still works**

```bash
npm run build
ls dist/assets/fonts/
```

Expected: `Inter-Regular.ttf`, `Inter-Bold.ttf`, `LICENSE.txt` in `dist/assets/fonts/`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsup.config.ts assets/
git commit -m "chore: add satori, resvg, bundle Inter fonts"
```

---

## Task 2: Capture `language` from GitHub repo

**Files:**
- Modify: `src/types.ts`
- Modify: `src/fetchers/github.ts`
- Modify: `test/fetchers/github.test.ts`

- [ ] **Step 1: Add `language` field to `GitHubRepo`**

Edit `src/types.ts`. In the `GitHubRepo` interface, add `language` after `license`:

```ts
export interface GitHubRepo {
  owner: string;
  repo: string;
  stars: number;
  openIssues: number;
  pushedAt: string;
  contributors: number;
  license: string | null;
  language: string | null;
}
```

- [ ] **Step 2: Write failing test**

Append to `test/fetchers/github.test.ts` (inside its existing describe block):

```ts
it("getRepo returns language from GitHub response", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({
      stargazers_count: 10,
      open_issues_count: 2,
      pushed_at: "2026-01-01T00:00:00Z",
      license: { spdx_id: "MIT" },
      language: "TypeScript",
    }), { status: 200 }) as unknown as Response,
  );
  const repo = await github.getRepo({ owner: "x", repo: "y" }, {});
  expect(repo?.language).toBe("TypeScript");
});

it("getRepo returns null language when missing", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({
      stargazers_count: 0,
      open_issues_count: 0,
      pushed_at: "2026-01-01T00:00:00Z",
    }), { status: 200 }) as unknown as Response,
  );
  const repo = await github.getRepo({ owner: "x", repo: "y" }, {});
  expect(repo?.language).toBeNull();
});
```

Run: `npx vitest run test/fetchers/github.test.ts -t "language"`
Expected: FAIL — `language` is undefined or test compile errors.

- [ ] **Step 3: Implement: extract `language` in `getRepo`**

Open `src/fetchers/github.ts`. Find the existing return inside `getRepo`. It currently has `license` parsed; add `language` parsing right after. Example: if the function looks like:

```ts
return {
  owner: ref.owner,
  repo: ref.repo,
  stars: body.stargazers_count ?? 0,
  openIssues: body.open_issues_count ?? 0,
  pushedAt: body.pushed_at ?? new Date(0).toISOString(),
  contributors: 0,
  license: body.license?.spdx_id ?? null,
};
```

change to:

```ts
return {
  owner: ref.owner,
  repo: ref.repo,
  stars: body.stargazers_count ?? 0,
  openIssues: body.open_issues_count ?? 0,
  pushedAt: body.pushed_at ?? new Date(0).toISOString(),
  contributors: 0,
  license: body.license?.spdx_id ?? null,
  language: body.language ?? null,
};
```

Also extend the type for `body` (in the `httpJson<...>` generic) to include `language?: string` if it has an explicit shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/fetchers/github.test.ts -t "language"`
Expected: both tests PASS.

Run: `npx vitest run`
Expected: typecheck issues only where `GitHubRepo` is constructed (fixtures) — those are addressed in T5. Other tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/fetchers/github.ts test/fetchers/github.test.ts
git commit -m "feat(github): capture repo language"
```

---

## Task 3: Add Persona types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append persona types after `Insights`**

Edit `src/types.ts`. Append after the `Insights` interface, before `Profile`:

```ts
export type PersonaType =
  | "rocket"
  | "streaker"
  | "one-hit-wonder"
  | "polyglot"
  | "veteran"
  | "active-maintainer"
  | "builder";

export interface PersonaInfo {
  type: PersonaType;
  label: string;     // human-readable name e.g. "The Streaker"
  emoji: string;     // single emoji
  description: string; // short tagline
}
```

- [ ] **Step 2: Add `persona` to Profile**

Modify the `Profile` interface to include the new field:

```ts
export interface Profile {
  name: string;
  type: "user" | "org";
  generatedAt: string;
  packageCount: number;
  totals: {
    downloadsLastWeek: number;
    downloadsLastMonth: number;
    downloadsAllTime: number;
    githubStars: number;
  };
  packages: Package[];
  github: ProfileGitHub;
  insights: Insights;
  persona: PersonaInfo;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: errors only at `Profile`-construction sites (`profile.ts`, fixtures). That's expected — fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Persona to Profile"
```

---

## Task 4: `detectPersona` pure function

**Files:**
- Create: `src/persona.ts`
- Create: `test/persona.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/persona.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectPersona } from "../src/persona.js";
import type { Profile } from "../src/types.js";

const baseProfile = (): Profile => ({
  name: "u",
  type: "user",
  generatedAt: "2026-05-07T00:00:00.000Z",
  packageCount: 3,
  totals: { downloadsLastWeek: 100, downloadsLastMonth: 400, downloadsAllTime: 5000, githubStars: 10 },
  packages: [
    {
      name: "p1", version: "1.0.0", versionsCount: 5, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2024-01-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 80, lastMonth: 300, allTime: 4000, allTimePartial: false },
      repository: null,
    },
    {
      name: "p2", version: "1.0.0", versionsCount: 3, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2024-06-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 15, lastMonth: 80, allTime: 800, allTimePartial: false },
      repository: null,
    },
    {
      name: "p3", version: "1.0.0", versionsCount: 1, unpackedSize: 1000, license: "MIT",
      firstPublishedAt: "2025-01-01T00:00:00.000Z", lastPublishedAt: "2026-04-01T00:00:00.000Z",
      downloads: { lastWeek: 5, lastMonth: 20, allTime: 200, allTimePartial: false },
      repository: null,
    },
  ],
  github: { followers: 0, available: true },
  insights: {
    velocity: { last30d: 0, prev30d: 0, deltaPct: 0, topGrowing: [] },
    health: { active: 0, sleeping: 0, dormant: 3, perPackage: { p1: "dormant", p2: "dormant", p3: "dormant" } },
    streak: { longestMonths: 0, currentMonths: 0, longestPackage: null },
  },
  persona: { type: "builder", label: "The Builder", emoji: "🛠️", description: "" },
});

describe("detectPersona", () => {
  it("rocket when velocity.deltaPct > 50", () => {
    const p = baseProfile();
    p.insights.velocity.deltaPct = 75;
    expect(detectPersona(p).type).toBe("rocket");
  });

  it("streaker when currentMonths >= 12", () => {
    const p = baseProfile();
    p.insights.streak.currentMonths = 12;
    expect(detectPersona(p).type).toBe("streaker");
  });

  it("one-hit-wonder when top package is >= 80% of all-time", () => {
    const p = baseProfile();
    // p1 = 4000, total = 5000 -> 80% exactly
    expect(detectPersona(p).type).toBe("one-hit-wonder");
  });

  it("polyglot when >= 4 distinct repo languages", () => {
    const p = baseProfile();
    // weaken one-hit-wonder by reshuffling downloads
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 2000;
    p.packages[2]!.downloads.allTime = 1000;
    p.totals.downloadsAllTime = 5000;
    p.packages[0]!.repository = mkRepo("TypeScript");
    p.packages[1]!.repository = mkRepo("Rust");
    p.packages[2]!.repository = mkRepo("Go");
    p.packages.push({
      ...p.packages[0]!,
      name: "p4",
      repository: mkRepo("Python"),
      downloads: { lastWeek: 0, lastMonth: 0, allTime: 0, allTimePartial: false },
    });
    expect(detectPersona(p).type).toBe("polyglot");
  });

  it("veteran when oldest package > 5 years and >= 5 packages", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    // 5 packages, oldest 6 years ago
    for (let i = 4; i <= 5; i++) {
      p.packages.push({
        ...p.packages[0]!, name: `p${i}`,
        firstPublishedAt: "2020-01-01T00:00:00.000Z",
      });
    }
    p.packageCount = p.packages.length;
    p.packages[0]!.firstPublishedAt = "2020-01-01T00:00:00.000Z";
    expect(detectPersona(p, new Date("2026-05-07T00:00:00.000Z")).type).toBe("veteran");
  });

  it("active-maintainer when >= 60% of packages active", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    p.insights.health = {
      active: 2, sleeping: 1, dormant: 0,
      perPackage: { p1: "active", p2: "active", p3: "sleeping" },
    };
    expect(detectPersona(p).type).toBe("active-maintainer");
  });

  it("builder fallback otherwise", () => {
    const p = baseProfile();
    p.packages[0]!.downloads.allTime = 2000;
    p.packages[1]!.downloads.allTime = 1500;
    p.packages[2]!.downloads.allTime = 1500;
    p.totals.downloadsAllTime = 5000;
    expect(detectPersona(p).type).toBe("builder");
  });
});

function mkRepo(language: string) {
  return {
    owner: "x", repo: "y", stars: 0, openIssues: 0,
    pushedAt: "2026-01-01T00:00:00.000Z",
    contributors: 0, license: null, language,
  };
}
```

Run: `npx vitest run test/persona.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `detectPersona`**

Create `src/persona.ts`:

```ts
import type { Profile, PersonaInfo, PersonaType } from "./types.js";

const PERSONAS: Record<PersonaType, Omit<PersonaInfo, "type">> = {
  rocket:             { label: "The Rocket",           emoji: "🚀", description: "Downloads accelerating fast" },
  streaker:           { label: "The Streaker",         emoji: "🔥", description: "Releasing month after month" },
  "one-hit-wonder":   { label: "The One-Hit Wonder",   emoji: "🎯", description: "One package carries the portfolio" },
  polyglot:           { label: "The Polyglot",         emoji: "🧬", description: "Shipping across many languages" },
  veteran:            { label: "The Veteran",          emoji: "🏛️", description: "Long-time contributor" },
  "active-maintainer":{ label: "The Active Maintainer",emoji: "⚒️", description: "Keeping packages fresh" },
  builder:            { label: "The Builder",          emoji: "🛠️", description: "Quietly shipping software" },
};

const make = (type: PersonaType): PersonaInfo => ({ type, ...PERSONAS[type] });

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export function detectPersona(profile: Profile, now: Date = new Date()): PersonaInfo {
  const { insights, packages, totals } = profile;

  if (insights.velocity.deltaPct > 50) return make("rocket");
  if (insights.streak.currentMonths >= 12) return make("streaker");

  if (totals.downloadsAllTime > 0) {
    const top = Math.max(...packages.map((p) => p.downloads.allTime), 0);
    if (top / totals.downloadsAllTime >= 0.8) return make("one-hit-wonder");
  }

  const languages = new Set(
    packages.map((p) => p.repository?.language).filter((l): l is string => !!l),
  );
  if (languages.size >= 4) return make("polyglot");

  if (packages.length >= 5) {
    const earliest = Math.min(
      ...packages.map((p) => new Date(p.firstPublishedAt).getTime()),
    );
    if (now.getTime() - earliest > FIVE_YEARS_MS) return make("veteran");
  }

  if (packages.length > 0 && insights.health.active / packages.length >= 0.6) {
    return make("active-maintainer");
  }

  return make("builder");
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run test/persona.test.ts`
Expected: ALL 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/persona.ts test/persona.test.ts
git commit -m "feat(persona): add archetype detector"
```

---

## Task 5: Wire `detectPersona` into `buildProfile` + update fixtures

**Files:**
- Modify: `src/profile.ts`
- Modify: `test/fixtures/profile-sample.ts`
- Modify: `test/profile.test.ts`
- Modify: `test/formatters/json.test.ts`

- [ ] **Step 1: Wire into `buildProfile`**

Edit `src/profile.ts`.

a. Add import:
```ts
import { detectPersona } from "./persona.js";
```

b. Just before the final `return` block, build the profile object first, run detector, attach. Replace the existing return:

```ts
return {
  name: opts.target,
  type: targetType,
  generatedAt: new Date().toISOString(),
  packageCount: finalPackages.length,
  totals,
  packages: finalPackages,
  github: { followers, available: githubAvailable, skipReason: githubSkipReason },
  insights,
};
```

with:

```ts
const profile: Profile = {
  name: opts.target,
  type: targetType,
  generatedAt: new Date().toISOString(),
  packageCount: finalPackages.length,
  totals,
  packages: finalPackages,
  github: { followers, available: githubAvailable, skipReason: githubSkipReason },
  insights,
  persona: { type: "builder", label: "", emoji: "", description: "" }, // placeholder; replaced below
};
profile.persona = detectPersona(profile);
return profile;
```

(The placeholder is needed only because `detectPersona` reads from a fully-typed `Profile`; it's overwritten on the next line.)

- [ ] **Step 2: Update `test/fixtures/profile-sample.ts`**

Two changes:

a. Add `language` to each repository object. For the existing two repos, add:
- chalk: `language: "JavaScript"`
- ora: `language: "JavaScript"`

b. Add a `persona` block to `sampleProfile`:
```ts
persona: {
  type: "veteran",
  label: "The Veteran",
  emoji: "🏛️",
  description: "Long-time contributor",
},
```

(Reason: the fixture spans 2013–2024, packageCount=2 — actually packageCount is 2, doesn't satisfy veteran ≥5. Use "builder" instead for safety:)

Use:
```ts
persona: {
  type: "builder",
  label: "The Builder",
  emoji: "🛠️",
  description: "Quietly shipping software",
},
```

`rateLimitedProfile` spreads from `sampleProfile`, so it inherits both `persona` and the language fields.

- [ ] **Step 3: Update `test/profile.test.ts`**

Anywhere `getRepo` is mocked, ensure the returned object includes `language: null` (or a sample language). Search for `pushedAt:` lines in the file and add `language: null,` next to them.

Run: `npx vitest run test/profile.test.ts`
Expected: PASS — fixtures now match new `Profile` shape and detector returns a valid PersonaInfo.

- [ ] **Step 4: Add JSON test for persona**

Append to `test/formatters/json.test.ts`:

```ts
it("includes persona block", () => {
  const out = JSON.parse(formatJson(sampleProfile));
  expect(out.persona.type).toBeDefined();
  expect(out.persona.label).toBeDefined();
  expect(out.persona.emoji).toBeDefined();
});
```

Run: `npx vitest run test/formatters/json.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS.

If snapshot tests for text/markdown/pretty fail because the fixture's persona spilled into them — they should NOT, because none of those formatters render persona yet. If they do fail, that means the fixture grew and the snapshot now omits something. Inspect the diff: if it's only fixture noise (e.g., language fields in repo) and nothing semantic, regenerate; if it's persona content, that's a bug — stop and report.

Run: `npx vitest run -u` only if the diff is innocuous (just non-rendered-by-this-formatter fields).

- [ ] **Step 6: Commit**

```bash
git add src/profile.ts test/fixtures/profile-sample.ts test/profile.test.ts test/formatters/json.test.ts
# include any regenerated snapshots
git add test/formatters/__snapshots__/ 2>/dev/null || true
git commit -m "feat(profile): detect and attach Persona"
```

---

## Task 6: Make format dispatcher async

**Files:**
- Modify: `src/formatters/index.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Make dispatcher async**

Replace `src/formatters/index.ts` with:

```ts
import type { Profile } from "../types.js";
import { formatJson } from "./json.js";
import { formatMarkdown } from "./markdown.js";
import { formatPretty } from "./pretty.js";
import { formatText } from "./text.js";

export type Format = "pretty" | "text" | "json" | "markdown" | "card";

export async function format(profile: Profile, fmt: Format, top: number, font: string): Promise<string> {
  switch (fmt) {
    case "json": return formatJson(profile);
    case "text": return formatText(profile, top);
    case "markdown": return formatMarkdown(profile, top);
    case "pretty": return formatPretty(profile, top, font);
    case "card": {
      const { formatCard } = await import("./card.js");
      return formatCard(profile, top);
    }
  }
}
```

(`formatCard` doesn't exist yet — import will fail at runtime if `card` is requested before T7. That's fine; tests pass by not exercising `card` until then.)

- [ ] **Step 2: Update CLI to await format**

Edit `src/cli.ts`. Find the call to `format(profile, fmt, top, font)`. Add `await`:

```ts
stdout((await format(profile, fmt, top, font)) + "\n");
```

Also update the validator that lists allowed formats:
```ts
if (!["pretty", "text", "json", "markdown", "card"].includes(fmtRaw)) {
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: ALL PASS. CLI test in particular must still work — if it asserts on stdout content, async/await wrapping doesn't change observable behavior.

- [ ] **Step 4: Commit**

```bash
git add src/formatters/index.ts src/cli.ts
git commit -m "refactor(formatters): async dispatcher; add card format"
```

---

## Task 7: Implement `formatCard` (SVG via satori)

**Files:**
- Create: `src/formatters/card.ts`
- Create: `test/formatters/card.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/formatters/card.test.ts`:

```ts
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
```

Run: `npx vitest run test/formatters/card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `formatCard`**

Create `src/formatters/card.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Profile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const fmt = new Intl.NumberFormat("en-US");

let cachedFonts: { regular: Buffer; bold: Buffer } | null = null;

function loadFonts(): { regular: Buffer; bold: Buffer } {
  if (cachedFonts) return cachedFonts;
  // Try dist-relative path first (production), then source-relative (dev/tests).
  const candidates = [
    join(__dirname, "..", "assets", "fonts"),               // dist/
    join(__dirname, "..", "..", "assets", "fonts"),         // src/formatters/ in dev
    join(__dirname, "..", "..", "..", "assets", "fonts"),   // some test layouts
  ];
  let regular: Buffer | null = null;
  let bold: Buffer | null = null;
  for (const dir of candidates) {
    try {
      regular = readFileSync(join(dir, "Inter-Regular.ttf"));
      bold = readFileSync(join(dir, "Inter-Bold.ttf"));
      break;
    } catch { /* try next */ }
  }
  if (!regular || !bold) {
    throw new Error("npm-pets: Inter font files not found in expected locations");
  }
  cachedFonts = { regular, bold };
  return cachedFonts;
}

type VNode = { type: string; props: Record<string, unknown> & { children?: VNode | VNode[] | string | (VNode | string)[] } };

const el = (type: string, props: Record<string, unknown>, ...children: (VNode | string)[]): VNode => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

const compactNumber = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export async function formatCard(profile: Profile, top: number): Promise<string> {
  const { default: satori } = await import("satori");
  const { regular, bold } = loadFonts();

  const palette = {
    bg: "#0b1020",
    panel: "#121a32",
    text: "#e6edf3",
    dim: "#94a3b8",
    accent: "#60a5fa",
    persona: "#f59e0b",
    success: "#34d399",
  };

  const stat = (value: string, label: string): VNode =>
    el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 } },
      el("div", { style: { fontSize: 56, fontWeight: 700, color: palette.text } }, value),
      el("div", { style: { fontSize: 22, color: palette.dim, marginTop: 4 } }, label),
    );

  const topPkgs = profile.packages.slice(0, top).map((p) =>
    el("div", { style: { display: "flex", justifyContent: "space-between", width: "100%", color: palette.text, fontSize: 24, marginBottom: 8 } },
      el("div", { style: { display: "flex" } }, `📦 ${p.name}`),
      el("div", { style: { color: palette.dim } }, `${compactNumber(p.downloads.lastMonth)}/mo`),
    ),
  );

  const v = profile.insights.velocity;
  const s = profile.insights.streak;
  const trendStr = `${v.deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(v.deltaPct).toFixed(0)}%`;
  const streakStr = s.longestMonths > 0 ? `${s.longestMonths}-mo streak` : "fresh start";
  const footer = `${profile.packageCount} packages · ${streakStr} · ${trendStr} MoM`;

  const root = el("div", {
    style: {
      display: "flex", flexDirection: "column",
      width: 1200, height: 630, padding: 56,
      backgroundColor: palette.bg, color: palette.text,
      fontFamily: "Inter",
    },
  },
    // Header row
    el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      el("div", { style: { fontSize: 28, color: palette.accent, fontWeight: 700 } }, "npm-pets"),
      el("div", { style: { fontSize: 22, color: palette.dim } }, profile.type === "org" ? "organization" : "user"),
    ),
    // Title block
    el("div", { style: { marginTop: 32, display: "flex", flexDirection: "column" } },
      el("div", { style: { fontSize: 64, fontWeight: 700, color: palette.text } }, profile.name),
      el("div", { style: { fontSize: 28, color: palette.persona, marginTop: 8, display: "flex" } },
        `${profile.persona.emoji}  ${profile.persona.label}`,
      ),
    ),
    // Stats row
    el("div", { style: { display: "flex", marginTop: 36, padding: 28, backgroundColor: palette.panel, borderRadius: 16 } },
      stat(compactNumber(profile.totals.downloadsLastWeek), "this week"),
      stat(compactNumber(profile.totals.downloadsLastMonth), "this month"),
      stat(compactNumber(profile.totals.downloadsAllTime), "all time"),
    ),
    // Top packages list
    el("div", { style: { marginTop: 32, display: "flex", flexDirection: "column" } }, ...topPkgs),
    // Spacer
    el("div", { style: { flex: 1 } }),
    // Footer
    el("div", { style: { fontSize: 22, color: palette.dim } }, footer),
  );

  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
    ],
  });

  return svg;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run test/formatters/card.test.ts`
Expected: 3 PASS.

If satori complains about TypeScript types for the VNode shape, the `as unknown as Parameters<typeof satori>[0]` cast bridges the gap.

- [ ] **Step 4: Commit**

```bash
git add src/formatters/card.ts test/formatters/card.test.ts
git commit -m "feat(card): satori-based SVG renderer"
```

---

## Task 8: Add `--export <file>` flag and PNG export

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing test for `--export`**

Append to `test/cli.test.ts`:

```ts
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("--export writes a non-empty PNG to the given path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "npm-pets-test-"));
  const out = join(dir, "card.png");
  // Note: this exercises the full path including network; we mock fetch globally.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    // very small mock: empty package list, empty repo data — runProfile returns minimal profile
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
  // PNG magic header
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
  rmSync(dir, { recursive: true, force: true });
}, 30_000);
```

If `runCli` is not already imported in this file with the right signature, peek at the top of the test file and use the same import pattern as existing tests.

Run: `npx vitest run test/cli.test.ts -t "--export"`
Expected: FAIL — `--export` flag not recognized.

- [ ] **Step 2: Add `--export` flag to citty command and CLI logic**

Edit `src/cli.ts`.

a. Add the flag in the `defineCommand` args block:
```ts
export: { type: "string", description: "Write PNG card to file path" },
```

b. After parsing args, extract:
```ts
const exportPath = parsed.export ? String(parsed.export) : undefined;
```

c. Replace the print branch. The current pattern is:
```ts
const profile = await buildProfile({ ... });
spinner.stop();
stdout((await format(profile, fmt, top, font)) + "\n");
return 0;
```

Replace with:
```ts
const profile = await buildProfile({ ... });
spinner.stop();

if (exportPath) {
  const { formatCard } = await import("./formatters/card.js");
  const { Resvg } = await import("@resvg/resvg-js");
  const svg = await formatCard(profile, top);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(exportPath, png);
  stderr(`wrote ${exportPath}\n`);
  return 0;
}

stdout((await format(profile, fmt, top, font)) + "\n");
return 0;
```

- [ ] **Step 3: Run test**

Run: `npx vitest run test/cli.test.ts -t "--export"`
Expected: PASS. (If timeout — bump to 60s. If satori takes >10s on first run, that's acceptable in CI.)

- [ ] **Step 4: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(cli): --export writes PNG card"
```

---

## Task 9: README + smoke + version bump

**Files:**
- Modify: `README.md` (add `--export` mention, persona)
- Modify: `package.json` (version)

- [ ] **Step 1: Update README**

Open `README.md`. Find the Usage section and add:
- Mention `--format card` (SVG to stdout) and `--export <file>` (PNG file).
- One-line mention of Persona.

Keep additions minimal — README isn't the focus; CLI `-h` is the source of truth.

- [ ] **Step 2: Run full suite + typecheck + build**

```bash
npx vitest run
npm run typecheck
npm run build
```

All expected: PASS. Then verify build artifacts:
```bash
ls dist/assets/fonts/
```
Expected: Inter-Regular.ttf, Inter-Bold.ttf, LICENSE.txt.

- [ ] **Step 3: Smoke runs**

```bash
node dist/cli.js sfrangulov --format card > /tmp/npm-pets-smoke.svg
ls -la /tmp/npm-pets-smoke.svg
node dist/cli.js sfrangulov --export /tmp/npm-pets-smoke.png
ls -la /tmp/npm-pets-smoke.png
file /tmp/npm-pets-smoke.png
```

Expected:
- SVG file > 5KB.
- PNG file > 50KB, `file` reports `PNG image data, 1200 x 630, ...`.

If those work — open the PNG in any viewer to eyeball it (developer can do this; subagent can skip the visual check).

If a network-limited environment causes failures, skip and document — build + tests already exercise the renderer.

- [ ] **Step 4: Bump version to 0.3.0**

Edit `package.json`: change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json
git commit -m "chore: bump version to 0.3.0"
```

- [ ] **Step 6: STOP**

Do NOT publish, do NOT tag, do NOT push. The user will publish from their machine.

---

## Self-Review

**Spec coverage (roadmap §5):**
- New format `card` + `--export <file>` flag — Tasks 6, 7, 8.
- 1200×630 layout — Task 7.
- Persona detector with 7 archetypes (Rocket / Streaker / One-Hit Wonder / Polyglot / Veteran / Active Maintainer / Builder fallback) — Task 4.
- Lazy require of satori/resvg — Task 6 (dispatcher), Task 8 (CLI export branch).
- Bundle Inter Regular+Bold — Task 1.
- Capture `language` for Polyglot detection — Task 2.

**Placeholder scan:** No "TBD"/"TODO"/etc. Each task has concrete code.

**Type consistency:**
- `PersonaType`, `PersonaInfo` — defined Task 3, used Tasks 4, 5, 7.
- `Profile.persona` — added Task 3, populated Task 5, read Task 7.
- `GitHubRepo.language` — added Task 2, populated Task 2, read Task 4.
- `formatCard(profile, top): Promise<string>` — declared Task 6 (dispatcher import), defined Task 7.
- `Format` union — extended Task 6 with `"card"`.
- Async `format(...)` — Task 6 changes return type to Promise; Task 6 also updates the CLI call site to `await`.

**Risks flagged:**
- Font path resolution across dist/dev/test — handled with multi-candidate fallback in Task 7.
- Test for `--export` is end-to-end heavy (~30s timeout); if too flaky, drop to a unit test that calls `formatCard` directly and pipes through Resvg synchronously.
