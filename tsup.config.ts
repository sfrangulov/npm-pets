import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
  entry: { cli: "src/cli.ts", lib: "src/lib.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  shims: false,
  onSuccess: async () => {
    const dest = join("dist", "assets", "fonts");
    mkdirSync(dest, { recursive: true });
    copyFileSync(join("assets", "fonts", "Inter-Regular.ttf"), join(dest, "Inter-Regular.ttf"));
    copyFileSync(join("assets", "fonts", "Inter-Bold.ttf"), join(dest, "Inter-Bold.ttf"));
    copyFileSync(join("assets", "fonts", "LICENSE.txt"), join(dest, "LICENSE.txt"));
  },
});
