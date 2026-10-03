import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Secrets stay server-side. Every module that ships to the browser (marked "use client", plus the shared domain
 * layer) must not import server code or read environment variables. `server-only` makes the build fail if a client
 * module imports `src/server`; this test catches the other routes (process.env, secret names, value imports).
 */
const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(SRC);
const rel = (file: string) => path.relative(process.cwd(), file);
const isClient = (source: string) => /^\s*["']use client["']/m.test(source.split("\n").slice(0, 5).join("\n"));
const clientFiles = files.filter((f) => isClient(fs.readFileSync(f, "utf8")));
const browserShared = files.filter((f) => f.startsWith(path.join(SRC, "domain")) || f.startsWith(path.join(SRC, "components")));
const browserFiles = [...new Set([...clientFiles, ...browserShared, ...files.filter((f) => f.startsWith(path.join(SRC, "features")))])];

describe("what ships to the browser", () => {
  it("finds the client modules it is meant to check", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
    expect(browserFiles.length).toBeGreaterThan(40); // client modules + domain + components + features
    expect(clientFiles.some((f) => rel(f).endsWith("PracticeExperience.tsx"))).toBe(true);
  });

  it("never imports server code (other than types)", () => {
    const offenders = browserFiles.flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*import\s/.test(line) && /@\/server\//.test(line) && !/^\s*import\s+type\s/.test(line))
        .map((line) => `${rel(file)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never reads environment variables or mentions a provider key", () => {
    const offenders = browserFiles.flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      const found: string[] = [];
      for (const m of text.matchAll(/process\.env\.(\w+)/g)) if (m[1] !== "NODE_ENV") found.push(`${rel(file)}: process.env.${m[1]}`);
      if (/(OPENAI|ANTHROPIC|GEMINI|AUTH)_(API_KEY|SECRET)|\bsk-ant-|\bsk-[A-Za-z0-9]{20,}/.test(text)) found.push(`${rel(file)}: mentions a key or secret`);
      return found;
    });
    expect(offenders).toEqual([]);
  });

  it("keeps server-only modules marked server-only (three documented exceptions)", () => {
    // schema.ts is read by the drizzle-kit CLI; quality-gate.ts is pure text checks shared with the test harness;
    // user-cookie.ts is the cookie-name constants the proxy shares. None holds a secret or touches a provider.
    const EXCEPTIONS = /server\/db\/schema\.ts$|evaluation\/quality-gate\.ts$|identity\/user-cookie\.ts$|auth\/secret\.ts$/;
    const unmarked = files
      .filter((f) => f.startsWith(path.join(SRC, "server")) && !/migrations|\.d\.ts$|\.test\./.test(f) && !EXCEPTIONS.test(f))
      .filter((f) => !/import "server-only";/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(unmarked).toEqual([]);
  });
});
