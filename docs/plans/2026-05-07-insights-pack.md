# Insights Pack (v0.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Insights` block (trend velocity, maintenance health, release streak) to every `Profile` and render it in all four formatters.

**Architecture:** Pure-function module `src/insights.ts` consumes already-fetched `Package` data plus a small new daily-downloads fetch; result lives in `Profile.insights`. Formatters add a single new section. No new external dependencies.

**Tech Stack:** TypeScript, native fetch, vitest, existing `httpJson`/`FsCache` infrastructure.

**Spec:** `docs/specs/2026-05-07-wow-features-roadmap.md` § 4.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | Add `Insights`, `VelocityInsights`, `HealthInsights`, `StreakInsights`, extend `Profile` |
| `src/insights.ts` | create | Pure functions: `computeVelocity`, `computeHealth`, `computeStreak`, `buildInsights` |
| `src/fetchers/npm.ts` | modify | Add `publishTimestamps: string[]` to `NpmPackageInfo`; add `getDownloadsDaily(pkg, days, cache)` |
| `src/profile.ts` | modify | Pass `publishTimestamps` through; fetch daily downloads in parallel; call `buildInsights`; attach to result |
| `src/formatters/text.ts` | modify | Render `Insights` section |
| `src/formatters/markdown.ts` | modify | Render `## Insights` section |
| `src/formatters/pretty.ts` | modify | Render insights inside boxen body |
| `test/insights.test.ts` | create | Unit tests for compute functions and `buildInsights` |
| `test/fetchers/npm.test.ts` | modify | Tests for `getDownloadsDaily` and `publishTimestamps` extraction |
| `test/fixtures/profile-sample.ts` | modify | Extend fixtures with realistic `insights` |
| `test/formatters/*.test.ts` | modify | Update snapshots after formatter changes |

---

## Task 1: Add `Insights` types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Open `src/types.ts` and append the new types after `ProfileGitHub`**

Add these interfaces and extend `Profile`:

```ts
export type HealthStatus = "active" | "sleeping" | "dormant";

export interface VelocityInsights {
  last30d: number;
  prev30d: number;
  deltaPct: number; // (last30d - prev30d) / prev30d * 100; 0 if prev30d === 0
  topGrowing: Array<{ name: string; deltaPct: number; last30d: number }>;
}

export interface HealthInsights {
  active: number;
  sleeping: number;
  dormant: number;
  perPackage: Record<string, HealthStatus>;
}

export interface StreakInsights {
  longestMonths: number;
  currentMonths: number;
  longestPackage: string | null; // package name, null if no packages
}

export interface Insights {
  velocity: VelocityInsights;
  health: HealthInsights;
  streak: StreakInsights;
}
```

Then change the `Profile` interface to include `insights`:

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
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: many errors about missing `insights` in `buildProfile` return value, fixtures, etc. — that's expected, will be fixed in subsequent tasks. Commit anyway because the type itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Insights interface to Profile"
```

---

## Task 2: Expose `publishTimestamps` from `getPackage`

**Files:**
- Modify: `src/fetchers/npm.ts`
- Modify: `test/fetchers/npm.test.ts` (if exists; otherwise create)

- [ ] **Step 1: Check if `test/fetchers/npm.test.ts` exists**

Run: `ls test/fetchers/`
If `npm.test.ts` does not exist, create it with this skeleton:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as npm from "../../src/fetchers/npm.js";

describe("npm fetcher", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });
});
```

- [ ] **Step 2: Write failing test for `publishTimestamps`**

Append inside the `describe("npm fetcher", ...)` block in `test/fetchers/npm.test.ts`:

```ts
it("getPackage returns sorted publishTimestamps from time map", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      name: "x",
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": {}, "0.1.0": {} },
      time: {
        created: "2020-01-01T00:00:00.000Z",
        modified: "2024-06-01T00:00:00.000Z",
        "0.1.0": "2020-01-15T00:00:00.000Z",
        "1.0.0": "2024-05-01T00:00:00.000Z",
      },
    }), { status: 200 }),
  ));
  const info = await npm.getPackage("x");
  expect(info.publishTimestamps).toEqual([
    "2020-01-15T00:00:00.000Z",
    "2024-05-01T00:00:00.000Z",
  ]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/fetchers/npm.test.ts -t "publishTimestamps"`
Expected: FAIL — `publishTimestamps` is undefined.

- [ ] **Step 4: Add `publishTimestamps` to `NpmPackageInfo` and populate in `getPackage`**

In `src/fetchers/npm.ts`, change the `NpmPackageInfo` interface:

```ts
export interface NpmPackageInfo {
  name: string;
  version: string;
  versionsCount: number;
  unpackedSize: number | null;
  license: string | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
  publishTimestamps: string[]; // sorted ISO timestamps of every published version
  repository: RepoRef | null;
}
```

In `getPackage`, after the `publishTimes` array is built, return it. Replace the existing return blocks:

The empty-body fallback:
```ts
if (!body) {
  return {
    name,
    version: "0.0.0",
    versionsCount: 0,
    unpackedSize: null,
    license: null,
    firstPublishedAt: new Date(0).toISOString(),
    lastPublishedAt: new Date(0).toISOString(),
    publishTimestamps: [],
    repository: null,
  };
}
```

The main return:
```ts
return {
  name: body.name ?? name,
  version: latest,
  versionsCount: versionList.length,
  unpackedSize: latestMeta?.dist?.unpackedSize ?? null,
  license,
  firstPublishedAt,
  lastPublishedAt,
  publishTimestamps: publishTimes,
  repository: parseRepository(body.repository),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/fetchers/npm.test.ts -t "publishTimestamps"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fetchers/npm.ts test/fetchers/npm.test.ts
git commit -m "feat(npm): expose publishTimestamps from getPackage"
```

---

## Task 3: Add `getDownloadsDaily` fetcher

**Files:**
- Modify: `src/fetchers/npm.ts`
- Modify: `test/fetchers/npm.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/fetchers/npm.test.ts` inside the same `describe`:

```ts
it("getDownloadsDaily returns last N daily counts oldest-first", async () => {
  // npm range API returns objects with a `downloads` array of {day, downloads}
  const today = new Date();
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (4 - i));
    return { day: d.toISOString().slice(0, 10), downloads: (i + 1) * 10 };
  });
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ downloads: days }), { status: 200 }),
  ));
  const out = await npm.getDownloadsDaily("x", 5);
  expect(out).toEqual([10, 20, 30, 40, 50]);
});

it("getDownloadsDaily returns array of zeros on 404", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response("not found", { status: 404 }),
  ));
  const out = await npm.getDownloadsDaily("nope", 3);
  expect(out).toEqual([0, 0, 0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fetchers/npm.test.ts -t "getDownloadsDaily"`
Expected: FAIL — function is not exported.

- [ ] **Step 3: Implement `getDownloadsDaily`**

Append to `src/fetchers/npm.ts`:

```ts
export async function getDownloadsDaily(pkg: string, days: number, cache?: FsCache): Promise<number[]> {
  if (days <= 0) return [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = today.toISOString().slice(0, 10);
  const url = `${DOWNLOADS}/downloads/range/${startStr}:${endStr}/${encodeURIComponent(pkg)}`;
  const { status, body } = await httpJson<{ downloads?: Array<{ day: string; downloads: number }> } | null>(url, { cache });
  if (status < 200 || status >= 300 || !body) return new Array(days).fill(0);
  const map = new Map<string, number>();
  for (const d of body.downloads ?? []) map.set(d.day, d.downloads);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(map.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/fetchers/npm.test.ts -t "getDownloadsDaily"`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fetchers/npm.ts test/fetchers/npm.test.ts
git commit -m "feat(npm): add getDownloadsDaily fetcher"
```

---

## Task 4: `computeVelocity` in `src/insights.ts`

**Files:**
- Create: `src/insights.ts`
- Create: `test/insights.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/insights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeVelocity } from "../src/insights.js";

describe("computeVelocity", () => {
  it("computes deltaPct from per-package daily series", () => {
    // last 60 days; first 30 = prev, last 30 = current
    const prev = new Array(30).fill(10); // 300
    const curr = new Array(30).fill(15); // 450 -> +50%
    const result = computeVelocity([
      { name: "a", daily: [...prev, ...curr] },
    ]);
    expect(result.prev30d).toBe(300);
    expect(result.last30d).toBe(450);
    expect(Math.round(result.deltaPct)).toBe(50);
  });

  it("aggregates totals across packages and ranks topGrowing by deltaPct", () => {
    const flat = (n: number) => new Array(60).fill(n);
    const result = computeVelocity([
      { name: "stable", daily: flat(10) },
      { name: "growing", daily: [...new Array(30).fill(5), ...new Array(30).fill(20)] },
      { name: "shrinking", daily: [...new Array(30).fill(20), ...new Array(30).fill(5)] },
    ]);
    expect(result.topGrowing[0]?.name).toBe("growing");
    expect(result.topGrowing).toHaveLength(3);
  });

  it("returns 0 deltaPct when prev30d is 0", () => {
    const result = computeVelocity([
      { name: "new", daily: [...new Array(30).fill(0), ...new Array(30).fill(10)] },
    ]);
    expect(result.deltaPct).toBe(0);
    expect(result.last30d).toBe(300);
  });

  it("handles empty input", () => {
    const result = computeVelocity([]);
    expect(result).toEqual({ last30d: 0, prev30d: 0, deltaPct: 0, topGrowing: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/insights.test.ts -t "computeVelocity"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computeVelocity`**

Create `src/insights.ts`:

```ts
import type { VelocityInsights } from "./types.js";

export interface PackageDaily {
  name: string;
  daily: number[]; // length must be >= 60 for full velocity; shorter pads as zeros
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function computeVelocity(input: PackageDaily[]): VelocityInsights {
  if (input.length === 0) {
    return { last30d: 0, prev30d: 0, deltaPct: 0, topGrowing: [] };
  }
  const perPkg = input.map((p) => {
    const padded = p.daily.length >= 60
      ? p.daily.slice(-60)
      : [...new Array(60 - p.daily.length).fill(0), ...p.daily];
    const prev = sum(padded.slice(0, 30));
    const curr = sum(padded.slice(30));
    const delta = prev === 0 ? 0 : ((curr - prev) / prev) * 100;
    return { name: p.name, prev30d: prev, last30d: curr, deltaPct: delta };
  });
  const last30d = perPkg.reduce((s, p) => s + p.last30d, 0);
  const prev30d = perPkg.reduce((s, p) => s + p.prev30d, 0);
  const deltaPct = prev30d === 0 ? 0 : ((last30d - prev30d) / prev30d) * 100;
  const topGrowing = perPkg
    .slice()
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 3)
    .map(({ name, deltaPct, last30d }) => ({ name, deltaPct, last30d }));
  return { last30d, prev30d, deltaPct, topGrowing };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/insights.test.ts -t "computeVelocity"`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/insights.ts test/insights.test.ts
git commit -m "feat(insights): add computeVelocity"
```

---

## Task 5: `computeHealth` in `src/insights.ts`

**Files:**
- Modify: `src/insights.ts`
- Modify: `test/insights.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/insights.test.ts`:

```ts
import { computeHealth } from "../src/insights.js";

describe("computeHealth", () => {
  const now = new Date("2026-05-07T00:00:00.000Z");
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it("classifies packages by recency: <30d active, 30-180d sleeping, >180d dormant", () => {
    const result = computeHealth(
      [
        { name: "fresh", lastActivity: daysAgo(5) },
        { name: "okay", lastActivity: daysAgo(60) },
        { name: "old", lastActivity: daysAgo(365) },
      ],
      now,
    );
    expect(result.active).toBe(1);
    expect(result.sleeping).toBe(1);
    expect(result.dormant).toBe(1);
    expect(result.perPackage).toEqual({
      fresh: "active",
      okay: "sleeping",
      old: "dormant",
    });
  });

  it("treats edge cases at exactly 30 and 180 days", () => {
    const result = computeHealth(
      [
        { name: "boundary30", lastActivity: daysAgo(30) },
        { name: "boundary180", lastActivity: daysAgo(180) },
      ],
      now,
    );
    expect(result.perPackage.boundary30).toBe("sleeping");
    expect(result.perPackage.boundary180).toBe("dormant");
  });

  it("handles empty input", () => {
    const result = computeHealth([], now);
    expect(result).toEqual({ active: 0, sleeping: 0, dormant: 0, perPackage: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/insights.test.ts -t "computeHealth"`
Expected: FAIL.

- [ ] **Step 3: Implement `computeHealth`**

Append to `src/insights.ts`:

```ts
import type { HealthInsights, HealthStatus } from "./types.js";

export interface PackageActivity {
  name: string;
  lastActivity: string; // ISO date — pushedAt from GH or lastPublishedAt fallback
}

export function computeHealth(input: PackageActivity[], now: Date = new Date()): HealthInsights {
  const out: HealthInsights = { active: 0, sleeping: 0, dormant: 0, perPackage: {} };
  for (const pkg of input) {
    const ts = new Date(pkg.lastActivity).getTime();
    const ageDays = (now.getTime() - ts) / (1000 * 60 * 60 * 24);
    let status: HealthStatus;
    if (ageDays < 30) status = "active";
    else if (ageDays < 180) status = "sleeping";
    else status = "dormant";
    out[status]++;
    out.perPackage[pkg.name] = status;
  }
  return out;
}
```

Note: also add the `HealthInsights, HealthStatus` to the existing `import type` line at the top of the file:

```ts
import type { VelocityInsights, HealthInsights, HealthStatus } from "./types.js";
```

(remove the second import statement; consolidate.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/insights.test.ts -t "computeHealth"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/insights.ts test/insights.test.ts
git commit -m "feat(insights): add computeHealth"
```

---

## Task 6: `computeStreak` in `src/insights.ts`

**Files:**
- Modify: `src/insights.ts`
- Modify: `test/insights.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/insights.test.ts`:

```ts
import { computeStreak } from "../src/insights.js";

describe("computeStreak", () => {
  const now = new Date("2026-05-07T00:00:00.000Z");

  it("counts the longest run of consecutive months across packages", () => {
    // Three releases in Jan/Feb/Mar 2024 = streak of 3
    const result = computeStreak(
      [
        {
          name: "a",
          publishTimestamps: [
            "2024-01-15T00:00:00.000Z",
            "2024-02-10T00:00:00.000Z",
            "2024-03-20T00:00:00.000Z",
            "2024-09-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.longestMonths).toBe(3);
    expect(result.longestPackage).toBe("a");
  });

  it("computes currentMonths as ongoing streak ending in the current calendar month", () => {
    // Releases Mar/Apr/May 2026 → currentMonths === 3 (May 2026 is "now")
    const result = computeStreak(
      [
        {
          name: "live",
          publishTimestamps: [
            "2026-03-10T00:00:00.000Z",
            "2026-04-10T00:00:00.000Z",
            "2026-05-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.currentMonths).toBe(3);
  });

  it("currentMonths is 0 when last release is older than 1 month from now", () => {
    const result = computeStreak(
      [{ name: "stale", publishTimestamps: ["2025-01-01T00:00:00.000Z"] }],
      now,
    );
    expect(result.currentMonths).toBe(0);
  });

  it("picks the package with longest streak when multiple compete", () => {
    const result = computeStreak(
      [
        { name: "short", publishTimestamps: ["2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z"] },
        {
          name: "long",
          publishTimestamps: [
            "2024-01-01T00:00:00.000Z",
            "2024-02-01T00:00:00.000Z",
            "2024-03-01T00:00:00.000Z",
            "2024-04-01T00:00:00.000Z",
          ],
        },
      ],
      now,
    );
    expect(result.longestMonths).toBe(4);
    expect(result.longestPackage).toBe("long");
  });

  it("handles empty input", () => {
    const result = computeStreak([], now);
    expect(result).toEqual({ longestMonths: 0, currentMonths: 0, longestPackage: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/insights.test.ts -t "computeStreak"`
Expected: FAIL.

- [ ] **Step 3: Implement `computeStreak`**

Append to `src/insights.ts`:

```ts
import type { StreakInsights } from "./types.js";

export interface PackagePublishes {
  name: string;
  publishTimestamps: string[];
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const monthsBetween = (a: string, b: string): number => {
  // returns number of calendar months from a to b (b - a). Same month = 0.
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by! - ay!) * 12 + (bm! - am!);
};

function longestConsecutiveStreak(months: string[]): number {
  if (months.length === 0) return 0;
  const uniq = Array.from(new Set(months)).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (monthsBetween(uniq[i - 1]!, uniq[i]!) === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function currentStreak(months: string[], now: Date): number {
  if (months.length === 0) return 0;
  const uniq = Array.from(new Set(months)).sort();
  const nowKey = monthKey(now);
  // current streak counts only if last release is in this month or last month
  const last = uniq[uniq.length - 1]!;
  if (monthsBetween(last, nowKey) > 1) return 0;
  let run = 1;
  for (let i = uniq.length - 1; i > 0; i--) {
    if (monthsBetween(uniq[i - 1]!, uniq[i]!) === 1) run++;
    else break;
  }
  return run;
}

export function computeStreak(input: PackagePublishes[], now: Date = new Date()): StreakInsights {
  if (input.length === 0) {
    return { longestMonths: 0, currentMonths: 0, longestPackage: null };
  }
  let longestMonths = 0;
  let longestPackage: string | null = null;
  let currentMonths = 0;
  for (const pkg of input) {
    const months = pkg.publishTimestamps.map((t) => monthKey(new Date(t)));
    const longest = longestConsecutiveStreak(months);
    if (longest > longestMonths) {
      longestMonths = longest;
      longestPackage = pkg.name;
    }
    const cur = currentStreak(months, now);
    if (cur > currentMonths) currentMonths = cur;
  }
  return { longestMonths, currentMonths, longestPackage };
}
```

Update the consolidated import at the top:

```ts
import type { VelocityInsights, HealthInsights, HealthStatus, StreakInsights } from "./types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/insights.test.ts -t "computeStreak"`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/insights.ts test/insights.test.ts
git commit -m "feat(insights): add computeStreak"
```

---

## Task 7: `buildInsights` aggregator + wire into `buildProfile`

**Files:**
- Modify: `src/insights.ts`
- Modify: `src/profile.ts`
- Modify: `test/insights.test.ts`
- Modify: `test/fixtures/profile-sample.ts`
- Modify: `test/profile.test.ts`

- [ ] **Step 1: Write test for `buildInsights`**

Append to `test/insights.test.ts`:

```ts
import { buildInsights } from "../src/insights.js";

describe("buildInsights", () => {
  it("composes velocity, health, streak from one input shape", () => {
    const now = new Date("2026-05-07T00:00:00.000Z");
    const result = buildInsights(
      [
        {
          name: "a",
          daily: [...new Array(30).fill(5), ...new Array(30).fill(10)],
          lastActivity: "2026-05-01T00:00:00.000Z", // active
          publishTimestamps: ["2026-04-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"],
        },
      ],
      now,
    );
    expect(result.velocity.last30d).toBe(300);
    expect(result.health.active).toBe(1);
    expect(result.streak.currentMonths).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/insights.test.ts -t "buildInsights"`
Expected: FAIL.

- [ ] **Step 3: Implement `buildInsights`**

Append to `src/insights.ts`:

```ts
import type { Insights } from "./types.js";

export interface PackageInsightInput extends PackageDaily, PackageActivity, PackagePublishes {}

export function buildInsights(input: PackageInsightInput[], now: Date = new Date()): Insights {
  return {
    velocity: computeVelocity(input.map(({ name, daily }) => ({ name, daily }))),
    health: computeHealth(input.map(({ name, lastActivity }) => ({ name, lastActivity })), now),
    streak: computeStreak(input.map(({ name, publishTimestamps }) => ({ name, publishTimestamps })), now),
  };
}
```

Consolidate the type import:

```ts
import type { VelocityInsights, HealthInsights, HealthStatus, StreakInsights, Insights } from "./types.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/insights.test.ts -t "buildInsights"`
Expected: PASS.

- [ ] **Step 5: Wire `buildInsights` into `buildProfile`**

Edit `src/profile.ts`:

a. Add the import after the existing fetcher imports:
```ts
import { buildInsights } from "./insights.js";
```

b. In the parallel `Promise.all` inside `packageNames.map(...)`, add `getDownloadsDaily` and capture `publishTimestamps`. Replace the existing `Promise.all` block with:

```ts
const info = await npm.getPackage(name, opts.cache);
const [lastWeek, lastMonth, allTime, daily] = await Promise.all([
  npm.getDownloadsPoint(name, "last-week", opts.cache),
  npm.getDownloadsPoint(name, "last-month", opts.cache),
  npm.getDownloadsRange(name, info.firstPublishedAt, opts.cache).catch(() => 0),
  npm.getDownloadsDaily(name, 60, opts.cache).catch(() => new Array(60).fill(0) as number[]),
]);
pkgDone++;
report(`fetching package data (${pkgDone}/${total})`);
return {
  name: info.name,
  version: info.version,
  versionsCount: info.versionsCount,
  unpackedSize: info.unpackedSize,
  license: info.license,
  firstPublishedAt: info.firstPublishedAt,
  lastPublishedAt: info.lastPublishedAt,
  publishTimestamps: info.publishTimestamps,
  daily,
  downloads: { lastWeek, lastMonth, allTime, allTimePartial: allTime === 0 && lastMonth > 0 },
  _ref: info.repository,
};
```

Update the `IntermediatePackage` type alias near the top of the function body:
```ts
type IntermediatePackage = Omit<Package, "repository"> & {
  _ref: npm.RepoRef | null;
  publishTimestamps: string[];
  daily: number[];
};
```

c. After computing `finalPackages` and `totals`, build insights. The intermediate `packages` array is no longer in scope by the time we get there because of the `.map(({ _ref, ...rest })` transform that drops `_ref` but also `publishTimestamps`/`daily`. To keep them available, change the destructuring to drop only `_ref`, `publishTimestamps`, `daily`:

```ts
const finalPackages: Package[] = packages
  .map(({ _ref, publishTimestamps: _pt, daily: _d, ...rest }) => ({
    ...rest,
    repository: _ref ? repoData.get(`${_ref.owner}/${_ref.repo}`) ?? null : null,
  }))
  .sort((a, b) => b.downloads.lastMonth - a.downloads.lastMonth);
```

d. Just before the `return` statement, compute insights from the original `packages` array:

```ts
const insights = buildInsights(
  packages.map((p) => {
    const lastActivity =
      (p._ref ? repoData.get(`${p._ref.owner}/${p._ref.repo}`)?.pushedAt : undefined) ??
      p.lastPublishedAt;
    return {
      name: p.name,
      daily: p.daily,
      lastActivity,
      publishTimestamps: p.publishTimestamps,
    };
  }),
);
```

e. Add `insights` to the returned `Profile`:

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

- [ ] **Step 6: Update fixtures with realistic insights**

Replace the contents of `test/fixtures/profile-sample.ts` with:

```ts
import type { Profile } from "../../src/types.js";

export const sampleProfile: Profile = {
  name: "sindresorhus",
  type: "user",
  generatedAt: "2026-05-07T12:00:00.000Z",
  packageCount: 2,
  totals: {
    downloadsLastWeek: 50_000_000,
    downloadsLastMonth: 200_000_000,
    downloadsAllTime: 9_000_000_000,
    githubStars: 27_000,
  },
  packages: [
    {
      name: "chalk",
      version: "5.3.0",
      versionsCount: 50,
      unpackedSize: 5000,
      license: "MIT",
      firstPublishedAt: "2013-01-01T00:00:00.000Z",
      lastPublishedAt: "2024-01-01T00:00:00.000Z",
      downloads: { lastWeek: 42_000_000, lastMonth: 180_000_000, allTime: 8_500_000_000, allTimePartial: false },
      repository: {
        owner: "chalk",
        repo: "chalk",
        stars: 22_000,
        openIssues: 4,
        pushedAt: "2024-01-01T00:00:00.000Z",
        contributors: 150,
        license: "MIT",
      },
    },
    {
      name: "ora",
      version: "8.0.1",
      versionsCount: 30,
      unpackedSize: 3000,
      license: "MIT",
      firstPublishedAt: "2015-06-01T00:00:00.000Z",
      lastPublishedAt: "2024-02-01T00:00:00.000Z",
      downloads: { lastWeek: 8_000_000, lastMonth: 20_000_000, allTime: 500_000_000, allTimePartial: false },
      repository: {
        owner: "sindresorhus",
        repo: "ora",
        stars: 5_000,
        openIssues: 12,
        pushedAt: "2024-02-01T00:00:00.000Z",
        contributors: 60,
        license: "MIT",
      },
    },
  ],
  github: { followers: 60_000, available: true },
  insights: {
    velocity: {
      last30d: 200_000_000,
      prev30d: 180_000_000,
      deltaPct: 11.11,
      topGrowing: [
        { name: "ora", deltaPct: 25, last30d: 20_000_000 },
        { name: "chalk", deltaPct: 8, last30d: 180_000_000 },
      ],
    },
    health: {
      active: 0,
      sleeping: 0,
      dormant: 2,
      perPackage: { chalk: "dormant", ora: "dormant" },
    },
    streak: {
      longestMonths: 6,
      currentMonths: 0,
      longestPackage: "chalk",
    },
  },
};

export const rateLimitedProfile: Profile = {
  ...sampleProfile,
  github: { followers: null, available: false, skipReason: "GitHub rate limit hit; set GITHUB_TOKEN for full data" },
  totals: { ...sampleProfile.totals, githubStars: 0 },
  packages: sampleProfile.packages.map((p) => ({ ...p, repository: null })),
};
```

- [ ] **Step 7: Run typecheck and full tests; fix any new failures**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run`
Expected: most tests PASS. Some snapshot tests in `test/formatters/*.test.ts` may fail because snapshots have not been updated yet — that's expected, they will be updated in tasks 9–11. Note any other failures (especially in `test/profile.test.ts`).

If `test/profile.test.ts` mocks fetchers, it must now also mock `getDownloadsDaily`. Add the mock there. Open `test/profile.test.ts`, find the `vi.mock("../src/fetchers/npm.js", ...)` block (or wherever fetchers are mocked) and add:

```ts
getDownloadsDaily: vi.fn(async () => new Array(60).fill(0)),
```

Also wherever `getPackage` is mocked, ensure the returned object includes `publishTimestamps: []`. If a test expects a particular `Profile` shape, update it to include the new `insights` field (you can use `expect.objectContaining` to keep the test focused, or compare the new field explicitly).

Re-run: `npx vitest run test/profile.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/insights.ts src/profile.ts test/insights.test.ts test/fixtures/profile-sample.ts test/profile.test.ts
git commit -m "feat(profile): compute and attach insights to Profile"
```

---

## Task 8: Verify json formatter handles insights

**Files:**
- Modify: `test/formatters/json.test.ts`

- [ ] **Step 1: Add a test asserting `insights` is in JSON output**

Open `test/formatters/json.test.ts`. Append:

```ts
it("includes insights block", () => {
  const out = JSON.parse(formatJson(sampleProfile));
  expect(out.insights.velocity.last30d).toBe(200_000_000);
  expect(out.insights.health.dormant).toBe(2);
  expect(out.insights.streak.longestPackage).toBe("chalk");
});
```

(Adjust imports at the top of the file if `formatJson` or `sampleProfile` aren't already imported — match the existing test file's import pattern.)

- [ ] **Step 2: Run test**

Run: `npx vitest run test/formatters/json.test.ts`
Expected: all PASS (the new assertion plus existing ones; existing ones may need snapshot regeneration — see step 3).

- [ ] **Step 3: If existing JSON snapshot fails, regenerate**

If a snapshot mismatch is reported:
Run: `npx vitest run test/formatters/json.test.ts -u`
Then verify the diff in `test/formatters/__snapshots__/json.test.ts.snap` only added the `insights` field — no unrelated changes.

- [ ] **Step 4: Commit**

```bash
git add test/formatters/json.test.ts test/formatters/__snapshots__/json.test.ts.snap
git commit -m "test(json): assert insights serialize"
```

---

## Task 9: Render insights in `text` formatter

**Files:**
- Modify: `src/formatters/text.ts`
- Modify: `test/formatters/text.test.ts` (snapshot update)

- [ ] **Step 1: Add an insights section to `formatText`**

Edit `src/formatters/text.ts`. Replace the `Top ${top} packages` block with the following so that insights appear before it:

Find the existing block:
```ts
  lines.push("");
  lines.push(`Top ${top} packages by monthly downloads`);
```

Replace with:
```ts
  lines.push("");
  lines.push("Insights");
  const v = profile.insights.velocity;
  const sign = v.deltaPct >= 0 ? "+" : "";
  lines.push(`  trend:    ${sign}${v.deltaPct.toFixed(1)}% MoM (${fmt.format(v.last30d)} vs ${fmt.format(v.prev30d)})`);
  const h = profile.insights.health;
  lines.push(`  health:   ${h.active} active · ${h.sleeping} sleeping · ${h.dormant} dormant`);
  const s = profile.insights.streak;
  if (s.longestMonths > 0) {
    const cur = s.currentMonths > 0 ? `, current ${s.currentMonths}` : "";
    lines.push(`  streak:   longest ${s.longestMonths} mo (${s.longestPackage})${cur}`);
  } else {
    lines.push(`  streak:   —`);
  }

  lines.push("");
  lines.push(`Top ${top} packages by monthly downloads`);
```

- [ ] **Step 2: Run snapshot test**

Run: `npx vitest run test/formatters/text.test.ts`
Expected: FAIL (snapshot mismatch, expected).

- [ ] **Step 3: Manually inspect failing diff**

Look at the diff: confirm only the new insights section was added. If it looks correct, regenerate:

Run: `npx vitest run test/formatters/text.test.ts -u`
Expected: PASS.

Open `test/formatters/__snapshots__/text.test.ts.snap` and visually verify the insights section is well-aligned. No more action needed if it looks good.

- [ ] **Step 4: Commit**

```bash
git add src/formatters/text.ts test/formatters/__snapshots__/text.test.ts.snap
git commit -m "feat(text): render insights section"
```

---

## Task 10: Render insights in `markdown` formatter

**Files:**
- Modify: `src/formatters/markdown.ts`
- Modify: `test/formatters/markdown.test.ts` (snapshot update)

- [ ] **Step 1: Add an insights section to `formatMarkdown`**

Edit `src/formatters/markdown.ts`. Insert the new section right before the existing `## Top ${top} packages` block:

Find:
```ts
  lines.push(`## Top ${top} packages`);
```

Insert immediately before it:
```ts
  lines.push("## Insights");
  lines.push("");
  const v = profile.insights.velocity;
  const sign = v.deltaPct >= 0 ? "+" : "";
  lines.push(`- **Trend:** ${sign}${v.deltaPct.toFixed(1)}% MoM (${fmt.format(v.last30d)} vs ${fmt.format(v.prev30d)})`);
  const h = profile.insights.health;
  lines.push(`- **Health:** ${h.active} active · ${h.sleeping} sleeping · ${h.dormant} dormant`);
  const s = profile.insights.streak;
  if (s.longestMonths > 0) {
    const cur = s.currentMonths > 0 ? `, current **${s.currentMonths}**` : "";
    lines.push(`- **Streak:** longest **${s.longestMonths} mo** in \`${s.longestPackage}\`${cur}`);
  } else {
    lines.push(`- **Streak:** —`);
  }
  lines.push("");
```

- [ ] **Step 2: Run snapshot test**

Run: `npx vitest run test/formatters/markdown.test.ts`
Expected: FAIL.

- [ ] **Step 3: Inspect and regenerate snapshot**

Run: `npx vitest run test/formatters/markdown.test.ts -u`
Verify the diff in `test/formatters/__snapshots__/markdown.test.ts.snap` is only the new section.

- [ ] **Step 4: Commit**

```bash
git add src/formatters/markdown.ts test/formatters/__snapshots__/markdown.test.ts.snap
git commit -m "feat(markdown): render insights section"
```

---

## Task 11: Render insights in `pretty` formatter

**Files:**
- Modify: `src/formatters/pretty.ts`
- Modify: `test/formatters/pretty.test.ts` (snapshot update)

- [ ] **Step 1: Add insights block to `formatPretty`**

Edit `src/formatters/pretty.ts`. Replace the body composition (`const body = ...`) to include an Insights section between Downloads and Top:

Find:
```ts
  const body =
    summaryLines.join("\n") +
    "\n\n" +
    chalk.bold("Downloads") +
    "\n" +
    dlTable.toString() +
    "\n\n" +
    chalk.bold(`Top ${top} by monthly downloads`) +
    "\n" +
    topTable.toString() +
    "\n\n" +
    chalk.dim(`Generated ${profile.generatedAt}`);
```

Replace with:
```ts
  const v = profile.insights.velocity;
  const trendSign = v.deltaPct >= 0 ? "↑" : "↓";
  const trendColor = v.deltaPct >= 0 ? chalk.green : chalk.red;
  const trendLine = `${trendColor(`${trendSign} ${Math.abs(v.deltaPct).toFixed(1)}%`)} MoM (${fmt.format(v.last30d)} vs ${fmt.format(v.prev30d)})`;
  const h = profile.insights.health;
  const healthLine = `${chalk.green(`● ${h.active}`)} active · ${chalk.yellow(`● ${h.sleeping}`)} sleeping · ${chalk.dim(`● ${h.dormant}`)} dormant`;
  const s = profile.insights.streak;
  const streakLine = s.longestMonths > 0
    ? `🔥 longest ${chalk.bold(`${s.longestMonths} mo`)} in ${chalk.cyan(s.longestPackage)}` +
        (s.currentMonths > 0 ? `, current ${chalk.bold(`${s.currentMonths}`)}` : "")
    : chalk.dim("🔥 no streak yet");

  const body =
    summaryLines.join("\n") +
    "\n\n" +
    chalk.bold("Downloads") +
    "\n" +
    dlTable.toString() +
    "\n\n" +
    chalk.bold("Insights") +
    "\n" +
    `  trend:   ${trendLine}\n` +
    `  health:  ${healthLine}\n` +
    `  streak:  ${streakLine}` +
    "\n\n" +
    chalk.bold(`Top ${top} by monthly downloads`) +
    "\n" +
    topTable.toString() +
    "\n\n" +
    chalk.dim(`Generated ${profile.generatedAt}`);
```

- [ ] **Step 2: Run snapshot test**

Run: `npx vitest run test/formatters/pretty.test.ts`
Expected: FAIL.

- [ ] **Step 3: Inspect and regenerate**

Run: `npx vitest run test/formatters/pretty.test.ts -u`
Open `test/formatters/__snapshots__/pretty.test.ts.snap` — verify only the insights block was added between Downloads and Top sections, that ANSI codes look balanced (each color opener has a closer).

- [ ] **Step 4: Commit**

```bash
git add src/formatters/pretty.ts test/formatters/__snapshots__/pretty.test.ts.snap
git commit -m "feat(pretty): render insights block in boxen body"
```

---

## Task 12: Full suite, build, smoke check, version bump

**Files:**
- Modify: `package.json` (version)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: tsup writes `dist/cli.js` without errors.

- [ ] **Step 4: Local smoke run (requires network)**

Run: `node dist/cli.js sfrangulov`
Expected: pretty output now includes an "Insights" section between Downloads and Top, with trend / health / streak lines. No crash. Caching may make this nearly instant on a second run.

Run: `node dist/cli.js sfrangulov -f json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log(p.insights);})"`
Expected: prints the insights object with `velocity`, `health`, `streak` keys.

If GitHub data is unavailable (no token, rate-limited), `health` should still produce values (falls back to `lastPublishedAt`). Verify this.

- [ ] **Step 5: Bump version to 0.2.0**

Edit `package.json`. Change:
```json
"version": "0.1.2",
```
to:
```json
"version": "0.2.0",
```

- [ ] **Step 6: Commit version bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0"
```

- [ ] **Step 7: Tag and (optionally) publish**

Decide based on whether the user wants to publish now:

If publishing:
```bash
git tag v0.2.0
npm publish --otp=<otp>
git push --follow-tags
```

If just landing the change without publishing yet, stop here. The next plan (v0.3 — PNG card + Persona) can ship with v0.2 still on npm.

---

## Self-Review Checklist (run after writing complete plan)

- [x] **Spec coverage:** velocity, health, streak — Tasks 4/5/6. Profile extension — Task 1+7. Render in 4 formats — Tasks 8/9/10/11.
- [x] **No placeholders:** every code block is concrete; no "TODO" / "implement later".
- [x] **Type consistency:** `Insights`, `VelocityInsights`, `HealthInsights`, `StreakInsights`, `HealthStatus` defined in Task 1, used identically thereafter. `PackageDaily`, `PackageActivity`, `PackagePublishes`, `PackageInsightInput` defined in Tasks 4–7, used in Task 7. `getDownloadsDaily(pkg, days, cache)` signature matches between Task 3 and Task 7. `publishTimestamps: string[]` matches between Task 2 and Task 7.
- [x] **Tests precede impl:** every implementation task has a failing test step before code.
- [x] **Commits are bite-sized:** each task ends with a single focused commit message.

If a future reader finds a bug, fix it inline in the plan and re-run the affected task.
