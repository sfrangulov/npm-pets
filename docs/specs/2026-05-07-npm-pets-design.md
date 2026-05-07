# npm-pets — Design

**Date:** 2026-05-07
**Status:** Approved (brainstorming complete)

## 1. Summary

`npm-pets` is a TypeScript CLI that prints a statistical profile for any npm user or organization. It aggregates data from the npm registry, npm downloads API, and GitHub API, and outputs a single shareable report (terminal pretty-print, plain text, JSON, or markdown).

The primary use case is generating a personal or org "card" suitable for sharing in Twitter/README/resume contexts.

## 2. Goals and non-goals

### Goals
- One command, one screen of useful stats for an npm user or org.
- Works with no setup (`npx npm-pets <name>`).
- Looks great in a terminal screenshot (ASCII art header, boxed layout, colors).
- Multiple output formats for different sharing contexts.
- Resilient to API rate limits — degrades gracefully rather than failing.

### Non-goals
- No AI / no summaries / no recommendations.
- No interactive TUI mode (single-shot command only).
- No tracking over time / no database / no historical trend graphs.
- No comparison between multiple users in a single invocation.
- No GitHub-only or generic-Git-host support — npm is the primary axis.

## 3. CLI shape

```
npm-pets <user-or-org> [options]

Options:
  -n, --top <number>         Top N packages (default: 5)
  -f, --format <fmt>         pretty | text | json | markdown   (default: pretty)
      --type <user|org|auto> Disambiguate target type        (default: auto)
      --font <name>          figlet font for pretty header   (default: Standard)
      --no-cache             Skip cache, force fresh fetch
      --cache-ttl <minutes>  Override default 60-minute TTL
  -t, --token <token>        GitHub token (or env GITHUB_TOKEN)
  -h, --help
  -v, --version

Examples:
  npx npm-pets sindresorhus
  npx npm-pets vercel --top 10 --format markdown > vercel.md
  npm-pets sfrangulov -f json | jq '.totalDownloads'
```

Auto-detection: probe org endpoint first; on 404, treat as user. `--type` overrides.

## 4. Data model

```ts
interface Profile {
  name: string;                    // npm username or org name
  type: "user" | "org";
  generatedAt: string;             // ISO timestamp
  packageCount: number;
  totals: {
    downloadsLastWeek: number;
    downloadsLastMonth: number;
    downloadsAllTime: number;
    githubStars: number;           // sum across linked repos
  };
  packages: Package[];             // all packages (sorted by month downloads desc)
  github: {
    followers: number | null;      // null if no GH user link / rate limited
    available: boolean;            // false if GH calls were skipped
    skipReason?: string;           // human-readable
  };
}

interface Package {
  name: string;
  version: string;                 // latest
  versionsCount: number;
  unpackedSize: number | null;     // bytes, from latest dist
  license: string | null;
  firstPublishedAt: string;        // ISO
  lastPublishedAt: string;         // ISO
  downloads: {
    lastWeek: number;
    lastMonth: number;
    allTime: number;
  };
  repository: GitHubRepo | null;
}

interface GitHubRepo {
  owner: string;
  repo: string;
  stars: number;
  openIssues: number;
  pushedAt: string;                // ISO, last commit
  contributors: number;            // count from Link header pagination
  license: string | null;
}
```

## 5. Data sources

### npm
| Need | Endpoint |
|---|---|
| List packages of user/org | `https://registry.npmjs.org/-/v1/search?text=maintainer:<name>&size=250` (paginate via `from`) |
| Org existence probe | `https://registry.npmjs.org/-/org/<name>` (404 → not org) |
| Package metadata | `https://registry.npmjs.org/<pkg>` |
| Downloads point | `https://api.npmjs.org/downloads/point/last-week\|last-month/<pkg>` |
| Downloads range (all-time) | `https://api.npmjs.org/downloads/range/<start>:<end>/<pkg>` (max 18 months/call → batch from `firstPublishedAt`) |

### GitHub (only when `repository` field resolves to a GitHub URL)
| Need | Endpoint |
|---|---|
| Repo info | `GET /repos/{owner}/{repo}` |
| Contributors count | `GET /repos/{owner}/{repo}/contributors?per_page=1` (parse `Link` header `last` page) |
| Profile owner followers | `GET /users/{login}` (once per profile) |

## 6. Execution flow

1. **Resolve target** — auto-detect user vs org; produce list of package names.
2. **Fetch package details** in parallel with concurrency = 8: metadata + week + month downloads + extract repo URL.
3. **All-time downloads** — for each package, batch range requests from `firstPublishedAt` to today (18-month chunks), sum counts.
4. **Deduplicate GitHub repos** by `owner/repo`, fetch repo info + contributors in parallel.
5. **Profile owner GH lookup** — best-effort: try `https://api.github.com/users/<npm-name>`; on 404 skip.
6. **Assemble `Profile`** → pass to formatter → write to stdout.

All fetches go through one `http` wrapper with: 10s timeout, 2 retries with exponential backoff, JSON parsing, cache integration.

## 7. Authentication and rate limits

GitHub anonymous: 60 req/hr. With token: 5,000 req/hr.

**Strategy (hybrid):**
- Read token from `--token` flag or `GITHUB_TOKEN` env var.
- If absent, run anonymous and degrade gracefully on 401/403/rate-limit:
  - Cancel pending GH requests.
  - In `Profile.github` set `available: false`, `skipReason: "GitHub rate limit hit; set GITHUB_TOKEN for full data"`.
  - Per-package `repository: null` if its data wasn't fetched in time.
- Output formatters render a clear notice when GH data is unavailable.

## 8. Caching

- File-based JSON cache at `~/.cache/npm-pets/<sha256(method+url)>.json`.
- Default TTL: 60 minutes. Configurable via `--cache-ttl`.
- `--no-cache` bypasses reads and writes.
- Cache stores `{fetchedAt, status, body}`. Reads check `Date.now() - fetchedAt < ttl`.
- No cache for non-200 responses.
- LRU-style cleanup is out of scope (rely on user to clean if needed; size is small).

## 9. Output formats

### `pretty` (default)
- Figlet ASCII header with profile name + `~ <target> ~` subtitle.
- Boxed sections via `boxen`.
- Tables via `cli-table3`.
- Colors via `chalk` (auto-disabled if non-TTY).
- Three-column download summary: last week / last month / all time.
- Top-N package table with: name, monthly downloads, stars, open issues.
- Footer: generation timestamp, cache age, GH availability.

### `text`
- Same content, no boxes, no colors, no figlet — just headings and aligned columns.

### `json`
- Direct `JSON.stringify(profile, null, 2)`. Stable schema (see §4).

### `markdown`
- README-friendly: H1/H2 headings, GitHub-flavored tables, no ASCII art.

## 10. Component architecture

```
src/
├── cli.ts            citty defineCommand → parse → runProfile()
├── profile.ts        orchestration: resolve → fetch → assemble Profile
├── types.ts
├── fetchers/
│   ├── npm.ts        listPackages, getPackage, getDownloadsPoint, getDownloadsRange
│   ├── github.ts     getRepo, getContributorsCount, getUser
│   └── http.ts       fetch wrapper: timeout, retry, JSON, cache
├── cache.ts          FsCache: get/set with TTL
├── concurrency.ts    minimal p-limit
└── formatters/
    ├── index.ts      dispatch by format
    ├── pretty.ts     figlet + boxen + chalk + table
    ├── text.ts
    ├── json.ts
    └── markdown.ts
```

**Boundaries:**
- `fetchers/*` — pure async functions. No CLI knowledge, no formatting, no `process` access.
- `profile.ts` — produces `Profile`. No I/O outside `fetchers`.
- `formatters/*` — `(profile) => string`. Pure.
- `cli.ts` — only place with `process.exit`, `console.log`, env reads.

This isolation enables: unit-testing fetchers with mocked `fetch`, snapshot-testing formatters with fixtures, testing CLI separately.

## 11. Error handling

| Scenario | Behavior |
|---|---|
| Target name not found (no packages, no org) | exit 1, message: `no npm packages found for <name>` |
| Network error / timeout | retry 2× with backoff, then degrade or fail |
| GH 401 (bad token) | warn once, drop token, continue anonymously |
| GH 403/429 (rate limit) | mark `github.available = false`, continue |
| Partial all-time downloads (one chunk fails) | sum what we have, mark with `*` in pretty output |
| Invalid CLI args | exit 2, print usage |

Logging is silent by default. `DEBUG=npm-pets` env enables verbose request log to stderr.

## 12. Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, target ES2022 | Modern Node features (top-level await, structuredClone) |
| Runtime | Node 20+, ESM | Native `fetch`, no node-fetch dep |
| CLI parser | `citty` | Lightweight, modern, good DX |
| ASCII header | `figlet` | Classic, many fonts, small |
| Boxes | `boxen` | de-facto standard |
| Colors | `chalk` | de-facto standard, auto-detects TTY |
| Tables | `cli-table3` | Maintained fork, good Unicode support |
| Build | `tsup` | Zero-config TS bundler, ESM/CJS dual if needed |
| Test | `vitest` | Fast, ESM-native, snapshot support |

No HTTP client — native `fetch` only. No `dotenv` — direct `process.env`.

## 13. Testing strategy

- **Fetchers** — mock `globalThis.fetch` per test, verify URLs, headers, retry behavior, pagination, rate-limit branching.
- **Cache** — hit/miss, TTL boundaries, `--no-cache`, hash collisions.
- **Formatters** — snapshot tests against canned `Profile` fixtures (small profile, large profile, GH-unavailable profile, no-packages profile).
- **CLI** — argument parsing, exit codes, env var precedence (`--token` > `GITHUB_TOKEN`).
- **Smoke integration** — gated by `RUN_INTEGRATION=1`, hits real APIs against a known small user (e.g., `sfrangulov`). Not run in CI by default.
- Coverage target: 80% on fetchers and formatters.

## 14. Distribution

- Published to npm as `npm-pets`.
- `package.json`:
  - `bin: { "npm-pets": "./dist/cli.js" }` (with shebang)
  - `type: "module"`
  - `engines: { node: ">=20" }`
  - `files: ["dist", "README.md"]`
  - `publishConfig: { access: "public" }`
- Both `npx npm-pets` and `npm i -g npm-pets` work out of the box.
- Single-file bundle via `tsup` to minimize startup time.

## 15. Out of scope (explicitly)

- AI/LLM features.
- Trend graphs, time-series storage.
- Comparison mode between multiple users.
- Non-GitHub git hosts (GitLab, Bitbucket).
- Authentication for npm private registries.
- Configurable profile fields / templates.
- Web UI.

## 16. Open follow-ups (after v1)

- `--font` font picker preview (`npm-pets --list-fonts`).
- Optional `--export <file>.png` rendered card via headless terminal screenshot.
- Per-package badge URLs in markdown output.
