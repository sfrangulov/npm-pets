import type { Profile } from "../types.js";

const fmt = new Intl.NumberFormat("en-US");

export function formatText(profile: Profile, top: number): string {
  const lines: string[] = [];
  lines.push(`npm-pets — ${profile.name} (${profile.type})`);
  lines.push("");
  lines.push(`Packages: ${profile.packageCount}`);
  if (profile.github.available) {
    lines.push(`GitHub stars (sum): ${fmt.format(profile.totals.githubStars)}`);
    if (profile.github.followers !== null) lines.push(`GitHub followers: ${fmt.format(profile.github.followers)}`);
  } else {
    lines.push(`GitHub: unavailable (${profile.github.skipReason ?? "unknown"})`);
  }
  lines.push("");
  lines.push("Downloads");
  lines.push(`  last week:   ${fmt.format(profile.totals.downloadsLastWeek)}`);
  lines.push(`  last month:  ${fmt.format(profile.totals.downloadsLastMonth)}`);
  lines.push(`  all time:    ${fmt.format(profile.totals.downloadsAllTime)}`);
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

  for (const pkg of profile.packages.slice(0, top)) {
    const stars = pkg.repository ? `★ ${fmt.format(pkg.repository.stars)}` : "★ —";
    const issues = pkg.repository ? `${pkg.repository.openIssues} issues` : "issues —";
    lines.push(`  ${pkg.name}  ${fmt.format(pkg.downloads.lastMonth)}/mo  ${stars}  ${issues}`);
  }

  lines.push("");
  lines.push(`Generated ${profile.generatedAt}`);
  return lines.join("\n");
}
