import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Profile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedFonts: { regular: Buffer; bold: Buffer } | null = null;

function loadFonts(): { regular: Buffer; bold: Buffer } {
  if (cachedFonts) return cachedFonts;
  // Try multiple paths to handle dev (src/formatters/), dist (dist/), and tests.
  const candidates = [
    join(__dirname, "..", "assets", "fonts"),                // dist/assets/fonts (post-tsup copy)
    join(__dirname, "..", "..", "assets", "fonts"),          // running from src/formatters/
    join(__dirname, "..", "..", "..", "assets", "fonts"),    // some test layouts
  ];
  let regular: Buffer | null = null;
  let bold: Buffer | null = null;
  for (const dir of candidates) {
    try {
      regular = readFileSync(join(dir, "Inter-Regular.ttf"));
      bold = readFileSync(join(dir, "Inter-Bold.ttf"));
      break;
    } catch { /* try next */ }
  }
  if (!regular || !bold) {
    throw new Error("npm-pets: Inter font files not found in expected locations");
  }
  cachedFonts = { regular, bold };
  return cachedFonts;
}

type VNode = {
  type: string;
  props: Record<string, unknown> & {
    children?: VNode | string | (VNode | string)[];
  };
};

const el = (type: string, props: Record<string, unknown>, ...children: (VNode | string)[]): VNode => ({
  type,
  props: {
    ...props,
    ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }),
  },
});

const compactNumber = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export async function formatCard(profile: Profile, top: number): Promise<string> {
  const { default: satori } = await import("satori");
  const { regular, bold } = loadFonts();

  const palette = {
    bg: "#0b1020",
    panel: "#121a32",
    text: "#e6edf3",
    dim: "#94a3b8",
    accent: "#60a5fa",
    persona: "#f59e0b",
  };

  const stat = (value: string, label: string): VNode =>
    el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 } },
      el("div", { style: { fontSize: 56, fontWeight: 700, color: palette.text } }, value),
      el("div", { style: { fontSize: 22, color: palette.dim, marginTop: 4 } }, label),
    );

  const topPkgs = profile.packages.slice(0, top).map((p) =>
    el(
      "div",
      { style: { display: "flex", justifyContent: "space-between", width: "100%", color: palette.text, fontSize: 24, marginBottom: 8 } },
      el("div", { style: { display: "flex" } }, `📦 ${p.name}`),
      el("div", { style: { color: palette.dim } }, `${compactNumber(p.downloads.lastMonth)}/mo`),
    ),
  );

  const v = profile.insights.velocity;
  const s = profile.insights.streak;
  const trendStr = `${v.deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(v.deltaPct).toFixed(0)}%`;
  const streakStr = s.longestMonths > 0 ? `${s.longestMonths}-mo streak` : "fresh start";
  const footer = `${profile.packageCount} packages · ${streakStr} · ${trendStr} MoM`;

  const root = el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height: 630,
        padding: 56,
        backgroundColor: palette.bg,
        color: palette.text,
        fontFamily: "Inter",
      },
    },
    el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      el("div", { style: { fontSize: 28, color: palette.accent, fontWeight: 700 } }, "npm-pets"),
      el("div", { style: { fontSize: 22, color: palette.dim } }, profile.type === "org" ? "organization" : "user"),
    ),
    el("div", { style: { marginTop: 32, display: "flex", flexDirection: "column" } },
      el("div", { style: { fontSize: 64, fontWeight: 700, color: palette.text } }, profile.name),
      el("div", { style: { fontSize: 28, color: palette.persona, marginTop: 8, display: "flex" } },
        `${profile.persona.emoji}  ${profile.persona.label}`,
      ),
    ),
    el("div", { style: { display: "flex", marginTop: 36, padding: 28, backgroundColor: palette.panel, borderRadius: 16 } },
      stat(compactNumber(profile.totals.downloadsLastWeek), "this week"),
      stat(compactNumber(profile.totals.downloadsLastMonth), "this month"),
      stat(compactNumber(profile.totals.downloadsAllTime), "all time"),
    ),
    el("div", { style: { marginTop: 32, display: "flex", flexDirection: "column" } }, ...topPkgs),
    el("div", { style: { flex: 1 } }),
    el("div", { style: { fontSize: 22, color: palette.dim } }, footer),
  );

  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    embedFont: false,
    fonts: [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
    ],
  });

  // Append a metadata comment so downstream consumers (and tests) can
  // find the plain-text values even though satori splits rendered text.
  const topPkgNames = profile.packages.slice(0, top).map((p) => p.name).join(", ");
  const meta = `<!-- npm-pets: name="${profile.name}" persona="${profile.persona.label}" packages="${topPkgNames}" -->`;
  return svg + "\n" + meta;
}
