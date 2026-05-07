import type { Profile } from "../types.js";

export function formatJson(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}
