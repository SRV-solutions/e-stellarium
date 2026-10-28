import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/env.ts", "./tests/setup.ts"],
    fileParallelism: false, // todos los tests comparten la misma base: van de a uno
    testTimeout: 15000,
  },
});