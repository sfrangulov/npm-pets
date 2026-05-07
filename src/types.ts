export interface CliOptions {
  target: string;
  top: number;
  format: "pretty" | "text" | "json" | "markdown";
  type: "user" | "org" | "auto";
  font: string;
  cache: boolean;
  cacheTtlMinutes: number;
  token: string | undefined;
}

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

export interface PackageDownloads {
  lastWeek: number;
  lastMonth: number;
  allTime: number;
  allTimePartial: boolean;
}

export interface Package {
  name: string;
  version: string;
  versionsCount: number;
  unpackedSize: number | null;
  license: string | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
  downloads: PackageDownloads;
  repository: GitHubRepo | null;
}

export interface ProfileGitHub {
  followers: number | null;
  available: boolean;
  skipReason?: string;
}

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
  label: string;
  emoji: string;
  description: string;
}

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
