import { defineCommand, renderUsage, runCommand } from "citty";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FsCache } from "./cache.js";
import { format, type Format } from "./formatters/index.js";
import { buildProfile } from "./profile.js";
import { Spinner } from "./spinner.js";

type Writer = (s: string) => void;

const command = defineCommand({
  meta: {
    name: "npm-pets",
    description: "CLI for npm user and organization stats",
  },
  args: {
    target: { type: "positional", description: "npm username or organization", required: true },
    top: { type: "string", alias: "n", description: "Top N packages", default: "5" },
    format: { type: "string", alias: "f", description: "pretty | text | json | markdown", default: "pretty" },
    type: { type: "string", description: "user | org | auto", default: "auto" },
    font: { type: "string", description: "figlet font for pretty header", default: "Standard" },
    "no-cache": { type: "boolean", description: "Skip cache, force fresh fetch", default: false },
    "cache-ttl": { type: "string", description: "Cache TTL in minutes", default: "60" },
    token: { type: "string", alias: "t", description: "GitHub token (or env GITHUB_TOKEN)" },
  },
  async run({ args }) {
    return args;
  },
});

export async function runCli(
  argv: string[],
  stdout: Writer = (s) => process.stdout.write(s),
  stderr: Writer = (s) => process.stderr.write(s),
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    stdout((await renderUsage(command)) + "\n");
    return 0;
  }

  let parsed: Record<string, unknown>;
  try {
    const res = await runCommand(command, { rawArgs: argv });
    parsed = res.result as Record<string, unknown>;
  } catch (err) {
    stderr(`${(err as Error).message}\n`);
    return 2;
  }

  const target = String(parsed.target).replace(/^@/, "");
  const fmtRaw = String(parsed.format);
  if (!["pretty", "text", "json", "markdown", "card"].includes(fmtRaw)) {
    stderr(`invalid --format "${fmtRaw}"\n`);
    return 2;
  }
  const fmt = fmtRaw as Format;
  const top = Math.max(1, parseInt(String(parsed.top), 10) || 5);
  const typeRaw = String(parsed.type);
  if (!["user", "org", "auto"].includes(typeRaw)) {
    stderr(`invalid --type "${typeRaw}"\n`);
    return 2;
  }
  const type = typeRaw as "user" | "org" | "auto";
  const font = String(parsed.font);
  const useCache = !parsed["no-cache"];
  const ttl = Math.max(0, parseInt(String(parsed["cache-ttl"]), 10) || 60);
  const token = (parsed.token as string | undefined) ?? process.env.GITHUB_TOKEN;

  const cache = useCache ? new FsCache(join(homedir(), ".cache", "npm-pets"), ttl) : undefined;

  const spinner = new Spinner(process.stderr);
  spinner.start("starting");
  try {
    const profile = await buildProfile({
      target, type, token, cache, concurrency: 4,
      onProgress: (s) => spinner.update(s),
    });
    spinner.stop();
    stdout((await format(profile, fmt, top, font)) + "\n");
    return 0;
  } catch (err) {
    spinner.stop();
    stderr(`${(err as Error).message}\n`);
    return 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
