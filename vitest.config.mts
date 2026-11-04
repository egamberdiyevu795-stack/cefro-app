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
    env: { SPEECH_GUARD: "off", AUDIO_ASSESSMENT: "off" },
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/live/**", "e2e/**", "node_modules/**"],
  },
});
