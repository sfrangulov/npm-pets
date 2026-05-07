import boxen from "boxen";
import chalk from "chalk";
import figlet from "figlet";
import Table from "cli-table3";
import type { Profile } from "../types.js";

const fmt = new Intl.NumberFormat("en-US");

export function formatPretty(profile: Profile, top: number, font: string): string {
  const sections: string[] = [];

  const header = figlet.textSync("npm-pets", { font: font as figlet.Fonts });
  sections.push(chalk.cyan(header));
  sections.push(chalk.dim(`              ~ ${profile.name} ~\n`));

  const summaryLines = [
    `${chalk.bold(profile.packageCount.toString())} packages` +
      (profile.github.available ? ` · ${chalk.bold(fmt.format(profile.totals.githubStars))} GitHub stars across repos` : ""),
  ];
  if (profile.github.available && profile.github.followers !== null) {
    summaryLines.push(`${chalk.bold(fmt.format(profile.github.followers))} GitHub followers`);
  }
  if (!profile.github.available) {
    summaryLines.push(chalk.yellow(`⚠ GitHub data unavailable: ${profile.github.skipReason ?? "unknown"}`));
  }

  const dlTable = new Table({
    head: [chalk.dim("last week"), chalk.dim("last month"), chalk.dim("all time")],
    style: { head: [], border: [] },
  });
  dlTable.push([
    fmt.format(profile.totals.downloadsLastWeek),
    fmt.format(profile.totals.downloadsLastMonth),
    fmt.format(profile.totals.downloadsAllTime),
  ]);

  const topTable = new Table({
    head: [chalk.dim("package"), chalk.dim("monthly DL"), chalk.dim("stars"), chalk.dim("issues")],
    style: { head: [], border: [] },
  });
  for (const pkg of profile.packages.slice(0, top)) {
    topTable.push([
      pkg.name,
      fmt.format(pkg.downloads.lastMonth),
      pkg.repository ? `★ ${fmt.format(pkg.repository.stars)}` : chalk.dim("—"),
      pkg.repository ? String(pkg.repository.openIssues) : chalk.dim("—"),
    ]);
  }

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

  sections.push(
    boxen(body, {
      padding: 1,
      borderStyle: "round",
      title: chalk.cyan(`profile · ${profile.name}`),
      titleAlignment: "center",
    }),
  );

  return sections.join("\n");
}
