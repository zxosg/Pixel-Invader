import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Stamps dist/sw.js with a version derived from the emitted (content-hashed) assets and the build id,
// so every build that changes the shell gets its own cache and the browser sees a changed sw.js.
function swCacheVersion(buildId: string): Plugin {
  return {
    name: "sw-cache-version",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir;
      if (outDir === undefined) return;
      const hash = createHash("sha256").update(buildId);
      for (const fileName of Object.keys(bundle).sort()) hash.update(fileName);
      const swPath = join(outDir, "sw.js");
      const source = readFileSync(swPath, "utf8");
      if (!source.includes("__BUILD_VERSION__")) throw new Error("sw.js is missing the __BUILD_VERSION__ placeholder.");
      writeFileSync(swPath, source.replace("__BUILD_VERSION__", hash.digest("hex").slice(0, 12)));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL(".", import.meta.url).pathname, "");
  const base = env.VITE_BASE || "/";
  const buildId = env.VITE_BUILD_ID
    || env.GITHUB_SHA
    || env.CF_PAGES_COMMIT_SHA
    || env.VERCEL_GIT_COMMIT_SHA
    || "";
  const releaseDate = env.VITE_RELEASE_DATE || "";

  return {
    base,
    define: {
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
      "import.meta.env.VITE_RELEASE_DATE": JSON.stringify(releaseDate),
    },
    plugins: [react(), swCacheVersion(buildId)],
    build: {
      target: "es2022",
    },
    worker: {
      format: "es",
    },
  };
});
