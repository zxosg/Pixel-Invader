import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL(".", import.meta.url).pathname, "");
  const buildId = env.VITE_BUILD_ID
    || env.GITHUB_SHA
    || env.CF_PAGES_COMMIT_SHA
    || env.VERCEL_GIT_COMMIT_SHA
    || "";

  return {
    define: {
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
    },
    plugins: [react()],
    build: {
      target: "es2022",
    },
    worker: {
      format: "es",
    },
  };
});
