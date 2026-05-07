import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface Entry<T> {
  fetchedAt: number;
  body: T;
}

export class FsCache {
  constructor(
    private readonly dir: string,
    private readonly ttlMinutes: number,
  ) {}

  private path(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return join(this.dir, `${hash}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.path(key), "utf8");
      const entry = JSON.parse(raw) as Entry<T>;
      const ageMs = Date.now() - entry.fetchedAt;
      if (ageMs > this.ttlMinutes * 60_000) return undefined;
      return entry.body;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, body: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const entry: Entry<T> = { fetchedAt: Date.now(), body };
    await writeFile(this.path(key), JSON.stringify(entry), "utf8");
  }
}
