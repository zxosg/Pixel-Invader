import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Engine tests are CPU-bound; the 5s default flakes under parallel load.
    testTimeout: 60_000,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      include: ["packages/*/src/**/*.ts"],
    },
  },
});
