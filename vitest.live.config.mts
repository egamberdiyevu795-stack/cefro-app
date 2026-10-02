import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Live validation against REAL providers (costs money, needs API keys).
 * Run with `npm run eval:live` / `npm run eval:transcription`. Never part of `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/live/**/*.live.test.ts"],
    setupFiles: ["test/live/setup.ts"],
    testTimeout: 15 * 60 * 1000,
    fileParallelism: false,
  },
});
