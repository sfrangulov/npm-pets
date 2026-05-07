import type { Profile } from "../types.js";

const fmt = new Intl.NumberFormat("en-US");

export function formatMarkdown(profile: Profile, top: number): string {
  const lines: string[] = [];
  lines.push(`# ${profile.name} on npm`);
  lines.push("");
  lines.push(`**Type:** ${profile.type} · **Packages:** ${profile.packageCount}`);
  if (profile.github.available && profile.github.followers !== null) {
    lines.push(`**GitHub followers:** ${fmt.format(profile.github.followers)} · **Total stars:** ${fmt.format(profile.totals.githubStars)}`);
  } else if (!profile.github.available) {
    lines.push(`> ⚠️ GitHub data unavailable: ${profile.github.skipReason ?? "unknown"}`);
  }
  lines.push("");
  lines.push("## Downloads");
  lines.push("");
  lines.push("| Period | Downloads |");
  lines.push("| --- | ---: |");
  lines.push(`| Last week | ${fmt.format(profile.totals.downloadsLastWeek)} |`);
  lines.push(`| Last month | ${fmt.format(profile.totals.downloadsLastMonth)} |`);
  lines.push(`| All time | ${fmt.format(profile.totals.downloadsAllTime)} |`);
  lines.push("");
  lines.push(`## Top ${top} packages`);
  lines.push("");
  lines.push("| Package | Monthly DL | Stars | Issues |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const pkg of profile.packages.slice(0, top)) {
    const stars = pkg.repository ? fmt.format(pkg.repository.stars) : "—";
    const issues = pkg.repository ? String(pkg.repository.openIssues) : "—";
    lines.push(`| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}) | ${fmt.format(pkg.downloads.lastMonth)} | ${stars} | ${issues} |`);
  }
  lines.push("");
  lines.push(`*Generated ${profile.generatedAt} by [npm-pets](https://www.npmjs.com/package/npm-pets).*`);
  return lines.join("\n");
}
