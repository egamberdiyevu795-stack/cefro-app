import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@/server/config/env", () => ({ getEnv: () => state.env }));

import { getDb, setDbForTesting } from "./client";
import { DatabaseUnavailableError } from "./errors";
import { PREVIEW_TURSO_MESSAGE, previewMayNotUseTurso, resolveDatabaseTarget } from "./target";
import { DatabaseAudioStorage } from "@/server/storage/database-audio-storage";

const TOKEN = "preview-leak-token-0123456789";
const URL_ = "libsql://prod-db-someorg.turso.io";
const base = { DATABASE_PATH: ":memory:", DATABASE_TIMEOUT_MS: 5000 };
const withTurso = { ...base, TURSO_DATABASE_URL: URL_, TURSO_AUTH_TOKEN: TOKEN };

describe("a Vercel Preview deployment is kept away from the production database", () => {
  describe("target resolution", () => {
    it("refuses Turso credentials in Preview by default", () => {
      expect(() => resolveDatabaseTarget({ ...withTurso, VERCEL_ENV: "preview" })).toThrow(PREVIEW_TURSO_MESSAGE);
      expect(() => resolveDatabaseTarget({ ...withTurso, VERCEL_ENV: "preview", CEFRO_ALLOW_PREVIEW_TURSO: "false" })).toThrow(/Preview/);
      // Either variable is enough to refuse: the credentials are in the wrong place.
      expect(() => resolveDatabaseTarget({ ...base, TURSO_AUTH_TOKEN: TOKEN, VERCEL_ENV: "preview" })).toThrow(/Preview/);
    });

    it("allows them only when Preview explicitly has its own database", () => {
      expect(resolveDatabaseTarget({ ...withTurso, VERCEL_ENV: "preview", CEFRO_ALLOW_PREVIEW_TURSO: "true" })).toMatchObject({ kind: "turso" });
    });

    it("does not affect production, development, or a Preview without credentials", () => {
      expect(resolveDatabaseTarget({ ...withTurso, VERCEL_ENV: "production" })).toMatchObject({ kind: "turso" });
      expect(resolveDatabaseTarget({ ...withTurso, VERCEL_ENV: "development" })).toMatchObject({ kind: "turso" });
      expect(resolveDatabaseTarget(withTurso)).toMatchObject({ kind: "turso" }); // not on Vercel at all
      expect(resolveDatabaseTarget({ ...base, VERCEL_ENV: "preview" })).toEqual({ kind: "file", path: ":memory:" });
    });

    it("the message names the remedy and carries no credential", () => {
      expect(PREVIEW_TURSO_MESSAGE).not.toContain(TOKEN);
      expect(PREVIEW_TURSO_MESSAGE).not.toContain("turso.io");
      expect(previewMayNotUseTurso({ ...withTurso, VERCEL_ENV: "preview" })).toBe(true);
    });
  });

  describe("in the real initialisation path (getDb), nothing connects", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      setDbForTesting(undefined);
      fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network must not be used"));
    });
    afterEach(() => {
      fetchSpy.mockRestore();
      setDbForTesting(undefined);
    });

    it("getDb rejects as 'database unavailable' in Preview with credentials, without any network request or credential in the error", async () => {
      state.env = { ...withTurso, VERCEL_ENV: "preview" };
      const error = await getDb().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatabaseUnavailableError);
      expect(String((error as Error).message)).toMatch(/Preview/);
      expect(JSON.stringify([(error as Error).message, (error as Error).stack])).not.toContain(TOKEN);
      expect(fetchSpy).not.toHaveBeenCalled();
      // A refusal is not remembered as a connection: fixing the configuration works on the next request.
      state.env = { ...base, DATABASE_PATH: ":memory:" };
      await expect(getDb()).resolves.toBeTruthy();
    });

    it("recordings in the database are refused the same way (they use the same connection)", async () => {
      state.env = { ...withTurso, VERCEL_ENV: "preview" };
      await expect(new DatabaseAudioStorage().read("speaking/x/y.webm")).rejects.toBeInstanceOf(DatabaseUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("production deployments are not affected by the guard", async () => {
      state.env = { ...base, VERCEL_ENV: "production" };
      await expect(getDb()).resolves.toBeTruthy(); // local file/memory target: no Turso configured, no refusal
    });
  });
});
