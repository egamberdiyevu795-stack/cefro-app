import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Most tests feed fake audio bytes to fake providers; the Speech Activity Guard has its own tests, which switch it on.
    // The audio step (pronunciation from the recording) is off unless a test turns it on with a fake assessor.
    // Parts 1.1 and 3 are live by default since 2026-11-15; the suite keeps them closed so the "part not live" rules
    // (Coming soon, 404, refused uploads) stay tested. src/config/features.test.ts checks the real defaults.
    env: { SPEECH_GUARD: "off", AUDIO_ASSESSMENT: "off", PART_1_1_LIVE: "false", PART_3_LIVE: "false" },
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/live/**", "e2e/**", "node_modules/**"],
  },
});
