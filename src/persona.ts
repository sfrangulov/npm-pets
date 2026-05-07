import type { Profile, PersonaInfo, PersonaType } from "./types.js";

const PERSONAS: Record<PersonaType, Omit<PersonaInfo, "type">> = {
  rocket:              { label: "The Rocket",            emoji: "🚀", description: "Downloads accelerating fast" },
  streaker:            { label: "The Streaker",          emoji: "🔥", description: "Releasing month after month" },
  "one-hit-wonder":    { label: "The One-Hit Wonder",    emoji: "🎯", description: "One package carries the portfolio" },
  polyglot:            { label: "The Polyglot",          emoji: "🧬", description: "Shipping across many languages" },
  veteran:             { label: "The Veteran",           emoji: "🏛️", description: "Long-time contributor" },
  "active-maintainer": { label: "The Active Maintainer", emoji: "⚒️", description: "Keeping packages fresh" },
  builder:             { label: "The Builder",           emoji: "🛠️", description: "Quietly shipping software" },
};

const make = (type: PersonaType): PersonaInfo => ({ type, ...PERSONAS[type] });

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export function detectPersona(profile: Profile, now: Date = new Date()): PersonaInfo {
  const { insights, packages, totals } = profile;

  if (insights.velocity.deltaPct > 50) return make("rocket");
  if (insights.streak.currentMonths >= 12) return make("streaker");

  if (totals.downloadsAllTime > 0) {
    const top = Math.max(...packages.map((p) => p.downloads.allTime), 0);
    if (top / totals.downloadsAllTime >= 0.8) return make("one-hit-wonder");
  }

  const languages = new Set(
    packages.map((p) => p.repository?.language).filter((l): l is string => !!l),
  );
  if (languages.size >= 4) return make("polyglot");

  if (packages.length >= 5) {
    const earliest = Math.min(
      ...packages.map((p) => new Date(p.firstPublishedAt).getTime()),
    );
    if (now.getTime() - earliest > FIVE_YEARS_MS) return make("veteran");
  }

  if (packages.length > 0 && insights.health.active / packages.length >= 0.6) {
    return make("active-maintainer");
  }

  return make("builder");
}
