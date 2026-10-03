import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyHostingDefaults, VERCEL_TEMP_DIR } from "./env";
import { usesTemporaryStorage } from "./provider-config";

describe("hosting defaults (Vercel)", () => {
  it("changes nothing off Vercel", () => {
    const raw = { NODE_ENV: "production" };
    expect(applyHostingDefaults(raw)).toBe(raw);
  });

  it("on Vercel, puts the database and recordings in the writable temp directory and derives the public origin", () => {
    const out = applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "cefro-abc123.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "cefro.vercel.app" });
    expect(out.DATABASE_PATH).toBe(`${VERCEL_TEMP_DIR}/cefro.db`);
    expect(out.AUDIO_STORAGE_DIR).toBe(`${VERCEL_TEMP_DIR}/audio`);
    expect(out.APP_URL).toBe("https://cefro.vercel.app"); // the production domain wins over the per-deployment URL
    expect(applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "cefro-abc123.vercel.app" }).APP_URL).toBe("https://cefro-abc123.vercel.app");
  });

  it("never overrides an explicit setting", () => {
    const out = applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "x.vercel.app", DATABASE_PATH: "/mnt/db/cefro.db", AUDIO_STORAGE_DIR: "/mnt/audio", APP_URL: "https://test.example.com" });
    expect(out).toMatchObject({ DATABASE_PATH: "/mnt/db/cefro.db", AUDIO_STORAGE_DIR: "/mnt/audio", APP_URL: "https://test.example.com" });
  });

  describe("temporary storage notice", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("is flagged only on Vercel and only for /tmp paths", () => {
      const tmp = { DATABASE_PATH: "/tmp/cefro/cefro.db", AUDIO_STORAGE_DIR: "/tmp/cefro/audio" };
      vi.stubEnv("VERCEL", "");
      expect(usesTemporaryStorage(tmp)).toBe(false);
      vi.stubEnv("VERCEL", "1");
      expect(usesTemporaryStorage(tmp)).toBe(true);
      expect(usesTemporaryStorage({ DATABASE_PATH: "/mnt/db", AUDIO_STORAGE_DIR: "/mnt/audio" })).toBe(false);
    });
  });
});

describe("Vercel packaging (next.config.ts)", () => {
  const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

  it("keeps the native/binary packages external and ships the files that are read at runtime", () => {
    expect(config).toMatch(/serverExternalPackages:\s*\[[^\]]*"better-sqlite3"[^\]]*"ffmpeg-static"/);
    expect(config).toContain("./src/server/db/migrations/**/*"); // read by the migrator on first database use
    expect(config).toContain("./node_modules/ffmpeg-static/ffmpeg"); // the speech guard's decoder
    expect(config).toContain("/api/speaking/attempts"); // the routes that process an attempt
  });

  it("the migrations directory it points at exists", () => {
    expect(fs.readdirSync(path.join(process.cwd(), "src/server/db/migrations")).some((f) => f.endsWith(".sql"))).toBe(true);
  });
});
