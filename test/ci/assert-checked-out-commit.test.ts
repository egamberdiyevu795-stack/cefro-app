import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCheckedOutCommit } from "../../scripts/ci/assert-checked-out-commit.mjs";

// These tests start real child processes (node, git); give them room when the whole suite is running in parallel.
vi.setConfig({ testTimeout: 30_000 });

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-sha-"));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  fs.writeFileSync(path.join(dir, "a.txt"), "one");
  git("add", ".");
  git("commit", "-q", "-m", "first");
  const first = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "a.txt"), "two");
  git("commit", "-q", "-am", "second");
  return { dir, git, first, second: git("rev-parse", "HEAD") };
}

describe("assertCheckedOutCommit", () => {
  it("passes when HEAD is the expected commit and the tree is clean", () => {
    const { dir, second } = repo();
    expect(assertCheckedOutCommit({ expected: second, cwd: dir })).toEqual({ ok: true });
  });

  it("fails when HEAD is a different commit (an older or newer checkout than GITHUB_SHA)", () => {
    const { dir, first, second } = repo();
    const result = assertCheckedOutCommit({ expected: first, cwd: dir });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain(second.slice(0, 12));
    expect((result as { error: string }).error).toContain(first.slice(0, 12));
    expect((result as { error: string }).error).toMatch(/Nothing was migrated or deployed/);
  });

  it("fails on an abbreviated, empty, missing or malformed GITHUB_SHA", () => {
    const { dir, second } = repo();
    for (const expected of [second.slice(0, 12), "", undefined, "not-a-sha", `${second}0`, second.toUpperCase()]) {
      expect(assertCheckedOutCommit({ expected, cwd: dir }), String(expected)).toMatchObject({ ok: false });
    }
  });

  it("fails when files were modified or added after the checkout (the upload would not be the commit)", () => {
    const { dir, second } = repo();
    fs.writeFileSync(path.join(dir, "a.txt"), "tampered");
    expect(assertCheckedOutCommit({ expected: second, cwd: dir })).toMatchObject({ ok: false, error: expect.stringMatching(/working tree has changes/) });
    fs.writeFileSync(path.join(dir, "a.txt"), "two");
    fs.writeFileSync(path.join(dir, "extra.js"), "x");
    expect(assertCheckedOutCommit({ expected: second, cwd: dir })).toMatchObject({ ok: false });
  });

  it("fails outside a git checkout", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-nogit-"));
    dirs.push(dir);
    expect(assertCheckedOutCommit({ expected: "a".repeat(40), cwd: dir })).toMatchObject({ ok: false });
  });
});

describe("scripts/ci/assert-checked-out-commit.mjs (as the workflow runs it)", () => {
  const run = (cwd: string, sha: string | undefined) =>
    new Promise<{ code: number; out: string }>((resolve) =>
      execFile(process.execPath, [path.join(process.cwd(), "scripts/ci/assert-checked-out-commit.mjs")], { cwd, env: { PATH: process.env.PATH, ...(sha ? { GITHUB_SHA: sha } : {}) } as unknown as NodeJS.ProcessEnv }, (error, stdout, stderr) =>
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: stdout + stderr }),
      ),
    );

  it("exits 0 for a matching SHA and 1, with an error annotation, for a mismatching or missing one", async () => {
    const { dir, first, second } = repo();
    const ok = await run(dir, second);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/assert-checked-out-commit: OK/);
    const mismatch = await run(dir, first);
    expect(mismatch.code).toBe(1);
    expect(mismatch.out).toMatch(/::error::assert-checked-out-commit:/);
    expect((await run(dir, undefined)).code).toBe(1);
  });
});
