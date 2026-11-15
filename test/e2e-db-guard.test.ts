import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { throwawayDatabasePath } from "../e2e/db";

/** e2e/db.ts writes straight into a database: it must refuse everything but this run's throwaway test file. */
describe("e2e/db guard", () => {
  const RUN = "1762500000000";
  let root: string;
  let outside: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-e2e-guard-"));
    fs.mkdirSync(path.join(root, "data", "e2e"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "e2e", `${RUN}.db`), "");
    outside = path.join(root, "data", "cefro.db"); // e.g. the development database
    fs.writeFileSync(outside, "");
    fs.symlinkSync(outside, path.join(root, "data", "e2e", "1762500000001.db"));
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("accepts this run's test database", () => {
    expect(throwawayDatabasePath(RUN, root)).toBe(fs.realpathSync(path.join(root, "data", "e2e", `${RUN}.db`)));
  });

  it("refuses without a run id, or with anything that is not a run id", () => {
    for (const id of [undefined, "", "abc", "../cefro", "../../data/cefro", "libsql://prod.turso.io", "1762500000000.db", "123"]) {
      expect(() => throwawayDatabasePath(id, root)).toThrow(/e2e\/db: /);
    }
  });

  it("refuses a run whose database does not exist (never creates one)", () => {
    expect(() => throwawayDatabasePath("1762500009999", root)).toThrow(/no such test database/);
    expect(fs.existsSync(path.join(root, "data", "e2e", "1762500009999.db"))).toBe(false);
  });

  it("refuses a test file that links to a database outside data/e2e", () => {
    expect(() => throwawayDatabasePath("1762500000001", root)).toThrow(/links outside/);
  });
});
