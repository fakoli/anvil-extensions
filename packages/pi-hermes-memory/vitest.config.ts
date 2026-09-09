import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    hookTimeout: 30_000,
    unstubGlobals: true,
    clearMocks: true,
    restoreMocks: true,
    passWithNoTests: true,
  },
});
