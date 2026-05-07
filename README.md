# npm-pets

CLI for npm user and organization stats. Generates a shareable profile with downloads, top packages, and GitHub stars — no AI, no setup.

## Quick start

```bash
npx npm-pets <user-or-org>
```

Or install globally:

```bash
npm i -g npm-pets
npm-pets sindresorhus
```

## Usage

```
npm-pets <user-or-org> [options]

Options:
  -n, --top <number>       Top N packages (default: 5)
  -f, --format <fmt>       pretty | text | json | markdown | card (default: pretty)
      --type <type>        user | org | auto (default: auto)
      --font <name>        figlet font for pretty header (default: Standard)
      --no-cache           Skip cache, force fresh fetch
      --cache-ttl <min>    Cache TTL in minutes (default: 60)
  -t, --token <token>      GitHub token (or env GITHUB_TOKEN)
      --export <file>      Write a Tweet-ready PNG (1200×630) to file
```

- `--format card` — emit a 1200×630 share card as SVG to stdout
- `--export <file>` — write the same card as a Tweet-ready PNG (1200×630)

Each profile is tagged with a Persona archetype (Rocket, Streaker, One-Hit Wonder, Polyglot, Veteran, Active Maintainer, or Builder) based on portfolio patterns.

## GitHub token

Without a token, GitHub API rate limits to 60 requests/hour, which is enough for small users but not for large orgs. Pass `--token` or set `GITHUB_TOKEN`. The tool degrades gracefully if rate-limited — npm data still appears.

## Examples

```bash
npx npm-pets vercel --top 10
npx npm-pets sindresorhus --format markdown > sindresorhus.md
npx npm-pets sfrangulov --format json | jq '.totals'
```

## License

MIT
