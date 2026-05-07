import type { VelocityInsights, HealthInsights, HealthStatus } from "./types.js";

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
