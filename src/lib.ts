// Library entrypoint: importable surface for npm-pets consumers (e.g. npm-pets.dev site).
// CLI users continue to use the CLI binary; this file is for programmatic embedding.

export { buildProfile } from "./profile.js";
export type { BuildProfileOptions } from "./profile.js";

export { formatCard } from "./formatters/card.js";

export { detectPersona } from "./persona.js";

export { FsCache } from "./cache.js";

export type {
  Profile,
  Package,
  PackageDownloads,
  GitHubRepo,
  ProfileGitHub,
  Insights,
  VelocityInsights,
  HealthInsights,
  StreakInsights,
  HealthStatus,
  PersonaInfo,
  PersonaType,
} from "./types.js";
