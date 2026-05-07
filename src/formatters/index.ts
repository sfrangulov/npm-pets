import type { Profile } from "../types.js";
import { formatJson } from "./json.js";
import { formatMarkdown } from "./markdown.js";
import { formatPretty } from "./pretty.js";
import { formatText } from "./text.js";

export type Format = "pretty" | "text" | "json" | "markdown";

export function format(profile: Profile, fmt: Format, top: number, font: string): string {
  switch (fmt) {
    case "json": return formatJson(profile);
    case "text": return formatText(profile, top);
    case "markdown": return formatMarkdown(profile, top);
    case "pretty": return formatPretty(profile, top, font);
  }
}
