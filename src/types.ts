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
}
