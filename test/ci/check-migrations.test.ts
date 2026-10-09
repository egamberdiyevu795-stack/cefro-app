import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GRANDFATHERED_THROUGH, checkMigrations } from "../../scripts/ci/check-migrations.mjs";

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** A copy of the real migrations folder, to which a test can add or change files. */
function copyOfMigrations() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-mig-"));
  dirs.push(root);
  const dir = path.join(root, "src/server/db/migrations");
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  return { root, dir };
}

function addMigration(dir: string, sql: string, tag = "0005_next", when?: number) {
  const journalPath = path.join(dir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const last = journal.entries.at(-1);
  journal.entries.push({ idx: journal.entries.length, version: "6", when: when ?? last.when + 1000, tag, breakpoints: true });
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  fs.writeFileSync(path.join(dir, `${tag}.sql`), sql);
}

describe("check-migrations", () => {
  it("accepts the migrations that are in the repository", () => {
    expect(checkMigrations(MIGRATIONS)).toEqual([]);
    expect(GRANDFATHERED_THROUGH).toBe(4); // 0000-0004 are applied everywhere; the rules start after them
  });

  it("accepts an additive migration", () => {
    const { dir } = copyOfMigrations();
    addMigration(dir, "CREATE TABLE `notes` (`id` text PRIMARY KEY NOT NULL);--> statement-breakpoint\nALTER TABLE `users` ADD `nickname` text;");
    expect(checkMigrations(dir)).toEqual([]);
  });

  it.each([
    ["DROP TABLE `notes`;", /drops schema/],
    ["ALTER TABLE `users` DROP COLUMN `name`;", /drops schema/],
    ["ALTER TABLE `users` RENAME COLUMN `name` TO `full_name`;", /renames schema/],
    ["DELETE FROM `users`;", /deletes data/],
    ["ALTER TABLE `users` ADD `plan` text NOT NULL;", /NOT NULL column without a DEFAULT/],
    ["PRAGMA foreign_keys=OFF;", /foreign-key enforcement/],
    ["UPDATE `users` SET `kind` = 'registered' WHERE `email` IS NOT NULL;", /rewrites existing data \(UPDATE\)/],
    ["CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);", /unique index/],
    ["CREATE TRIGGER block_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'no'); END;", /trigger/],
    ["CREATE TABLE `scores` (`id` text PRIMARY KEY NOT NULL, `value` integer CHECK (`value` >= 0));", /CHECK constraint/],
  ])("refuses a migration that is not backward compatible: %s", (sql, why) => {
    const { dir } = copyOfMigrations();
    addMigration(dir, sql);
    const problems = checkMigrations(dir) as string[];
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(why);
    expect(problems[0]).toContain("0005_next.sql");
  });

  it("accepts NOT NULL with a DEFAULT, and ignores statements inside comments", () => {
    const { dir } = copyOfMigrations();
    addMigration(dir, "-- DROP TABLE users (not done here)\nALTER TABLE `users` ADD `plan` text DEFAULT 'free' NOT NULL;");
    expect(checkMigrations(dir)).toEqual([]);
  });

  it("does not mistake a foreign key's ON UPDATE clause for an UPDATE statement", () => {
    const { dir } = copyOfMigrations();
    addMigration(dir, "CREATE TABLE `notes` (`id` text PRIMARY KEY NOT NULL, `user_id` text, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action);");
    expect(checkMigrations(dir)).toEqual([]);
  });

  it("accepts a risky statement once a reviewer's approval line is present (cefro:reviewed, or the older cefro:destructive-approved)", () => {
    for (const marker of ["cefro:reviewed", "cefro:destructive-approved"]) {
      const { dir } = copyOfMigrations();
      addMigration(dir, `-- ${marker}: backfill checked against the running release and a copy of the data\nUPDATE \`users\` SET \`kind\` = 'registered' WHERE \`email\` IS NOT NULL;`);
      expect(checkMigrations(dir), marker).toEqual([]);
    }
    const { dir } = copyOfMigrations();
    addMigration(dir, "-- cefro:reviewed:\nUPDATE `users` SET `kind` = 'x';"); // an empty reason does not count
    expect(checkMigrations(dir)).toHaveLength(1);
  });

  it("allows a destructive migration only with an explicit reviewed approval line", () => {
    const { dir } = copyOfMigrations();
    addMigration(dir, "-- cefro:destructive-approved: column unused since release 12, verified empty\nALTER TABLE `users` DROP COLUMN `image`;");
    expect(checkMigrations(dir)).toEqual([]);
  });

  it("refuses a timestamp that Drizzle would silently skip, and an unlisted or missing file", () => {
    const { dir } = copyOfMigrations();
    addMigration(dir, "CREATE TABLE `a` (`id` text);", "0005_old_timestamp", 1);
    expect((checkMigrations(dir) as string[]).join("\n")).toMatch(/silently skip/);
    fs.writeFileSync(path.join(dir, "0009_orphan.sql"), "SELECT 1;");
    expect((checkMigrations(dir) as string[]).join("\n")).toMatch(/0009_orphan.sql exists but is missing/);
    fs.rmSync(path.join(dir, "0005_old_timestamp.sql"));
    expect((checkMigrations(dir) as string[]).join("\n")).toMatch(/0005_old_timestamp.sql does not exist/);
  });

  describe("an already-applied migration is immutable (git comparison)", () => {
    function repo() {
      const { root, dir } = copyOfMigrations();
      const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: root, encoding: "utf8" }).trim();
      git("init", "-q");
      git("add", ".");
      git("commit", "-q", "-m", "base");
      return { root, dir, git, base: git("rev-parse", "HEAD") };
    }

    it("accepts a new migration file added after the base", () => {
      const { root, dir, git, base } = repo();
      addMigration(dir, "CREATE TABLE `a` (`id` text);");
      git("add", ".");
      git("commit", "-q", "-m", "add");
      expect(checkMigrations(dir, { base, cwd: root })).toEqual([]);
    });

    it("refuses an edit to, or the deletion of, an existing migration", () => {
      const { root, dir, git, base } = repo();
      fs.appendFileSync(path.join(dir, "0001_stage2_quality_observability.sql"), "\n-- edited\n");
      fs.rmSync(path.join(dir, "0004_recording_blobs.sql"));
      git("add", "-A");
      git("commit", "-q", "-m", "tamper");
      const text = (checkMigrations(dir, { base, cwd: root }) as string[]).join("\n");
      expect(text).toMatch(/0001_stage2_quality_observability\.sql: an existing migration was modified/);
      expect(text).toMatch(/0004_recording_blobs\.sql: an existing migration was deleted/);
    });

    it("skips the comparison when there is no base (new branch, manual run)", () => {
      const { root, dir } = repo();
      expect(checkMigrations(dir, { base: "0000000000000000000000000000000000000000", cwd: root })).toEqual([]);
      expect(checkMigrations(dir, { cwd: root })).toEqual([]);
    });
  });
});
