import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyHostingDefaults } from "./env";

describe("hosting defaults (Vercel)", () => {
  it("changes nothing off Vercel", () => {
    const raw = { NODE_ENV: "production" };
    expect(applyHostingDefaults(raw)).toBe(raw);
  });

  it("on Vercel, derives the public origin from the platform variables and leaves storage settings alone", () => {
    const out = applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "cefro-abc123.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "cefro.vercel.app" });
    expect(out.APP_URL).toBe("https://cefro.vercel.app"); // the production domain wins over the per-deployment URL
    expect(applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "cefro-abc123.vercel.app" }).APP_URL).toBe("https://cefro-abc123.vercel.app");
    // No /tmp defaults any more: a function's filesystem is per instance and wiped, so it must never hold data.
    expect(out.DATABASE_PATH).toBeUndefined();
    expect(out.AUDIO_STORAGE_DIR).toBeUndefined();
  });

  it("never overrides an explicit setting", () => {
    const out = applyHostingDefaults({ VERCEL: "1", VERCEL_URL: "x.vercel.app", APP_URL: "https://test.example.com" });
    expect(out.APP_URL).toBe("https://test.example.com");
  });
});

describe("Vercel packaging (next.config.ts)", () => {
  const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

  it("keeps the native/binary packages external and ships the files that are read at runtime", () => {
    expect(config).toMatch(/serverExternalPackages:\s*\[[^\]]*"libsql"[^\]]*"ffmpeg-static"/);
    expect(config).toContain("./src/server/db/migrations/**/*"); // read by the migrator on first database use
    expect(config).toContain("./node_modules/ffmpeg-static/ffmpeg"); // the speech guard's decoder
    expect(config).toContain("/api/speaking/attempts"); // the routes that process an attempt
  });

  it("the migrations directory it points at exists", () => {
    expect(fs.readdirSync(path.join(process.cwd(), "src/server/db/migrations")).some((f) => f.endsWith(".sql"))).toBe(true);
  });
});
