import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
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
    const fontsDest = join("dist", "assets", "fonts");
    mkdirSync(fontsDest, { recursive: true });
    copyFileSync(join("assets", "fonts", "Inter-Regular.ttf"), join(fontsDest, "Inter-Regular.ttf"));
    copyFileSync(join("assets", "fonts", "Inter-Bold.ttf"), join(fontsDest, "Inter-Bold.ttf"));
    copyFileSync(join("assets", "fonts", "LICENSE.txt"), join(fontsDest, "LICENSE.txt"));

    const personasSrc = join("src", "assets", "personas");
    const personasDest = join("dist", "assets", "personas");
    mkdirSync(personasDest, { recursive: true });
    for (const file of readdirSync(personasSrc)) {
      if (file.endsWith(".txt")) {
        copyFileSync(join(personasSrc, file), join(personasDest, file));
      }
    }
  },
});
