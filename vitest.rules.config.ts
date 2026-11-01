import { defineConfig } from "vitest/config";

// Security-rules tests share one emulator instance: run files serially.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    // The library requires firebase/compat/* itself; inlining keeps it on the
    // same module instance as the compat services imported in helpers.ts.
    server: { deps: { inline: [/@firebase\/rules-unit-testing/] } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
