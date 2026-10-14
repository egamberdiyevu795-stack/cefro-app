import { execFile } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractDeploymentUrl } from "../../scripts/ci/parse-deploy-url.mjs";

// These tests start real child processes (node, git); give them room when the whole suite is running in parallel.
vi.setConfig({ testTimeout: 30_000 });

const URL1 = "https://cefro-abc123xyz-team.vercel.app";

describe("extractDeploymentUrl", () => {
  it("accepts the plain one-line output", () => {
    expect(extractDeploymentUrl(`${URL1}\n`)).toEqual({ ok: true, url: URL1 });
    expect(extractDeploymentUrl(URL1)).toEqual({ ok: true, url: URL1 });
    expect(extractDeploymentUrl(`  ${URL1}  \r\n`)).toEqual({ ok: true, url: URL1 });
  });

  it("finds the URL in multi-line output (notices, warnings, progress) without assuming a single line", () => {
    const output = ["Vercel CLI 63.1.0", "Warning: a newer version is available", "Inspect: see the dashboard", URL1, "", "Done."].join("\n");
    expect(extractDeploymentUrl(output)).toEqual({ ok: true, url: URL1 });
  });

  it("uses the last valid URL when several appear, and ignores URLs on other hosts around it", () => {
    const second = "https://cefro-def456-team.vercel.app";
    expect(extractDeploymentUrl(`${URL1}\nhttps://vercel.com/docs\n${second}\n`)).toEqual({ ok: true, url: second });
    expect(extractDeploymentUrl(`https://vercel.com/docs/cli\n${URL1}\n`)).toEqual({ ok: true, url: URL1 });
  });

  it("normalises a trailing slash, and returns only the origin", () => {
    expect(extractDeploymentUrl(`${URL1}/\n`)).toEqual({ ok: true, url: URL1 });
  });

  it("rejects empty output with a clear message", () => {
    for (const output of ["", "\n\n", "   \n  ", undefined as unknown as string]) {
      const result = extractDeploymentUrl(output);
      expect(result).toMatchObject({ ok: false });
      expect((result as { error: string }).error).toMatch(/printed nothing/);
    }
  });

  it("rejects output without any URL line, without echoing the output", () => {
    const result = extractDeploymentUrl("Error: something failed with token SECRET-TOKEN-0123456789\nplease retry");
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/no URL line/);
    expect(JSON.stringify(result)).not.toContain("SECRET-TOKEN");
  });

  it.each([
    ["an unexpected host", "https://evil.example.com"],
    ["a look-alike host", "https://cefro-abc.vercel.app.evil.com"],
    ["a different vercel domain", "https://cefro.vercel.com"],
    ["a bare vercel.app", "https://vercel.app"],
    ["http instead of https", "http://cefro-abc.vercel.app"],
    ["credentials in the URL", "https://user:SECRET-PASS-0123456789@cefro-abc.vercel.app"],
    ["a port", "https://cefro-abc.vercel.app:8443"],
    ["a path", "https://cefro-abc.vercel.app/some/path"],
    ["a query string", "https://cefro-abc.vercel.app/?token=SECRET-QUERY-0123456789"],
    ["a fragment", "https://cefro-abc.vercel.app/#x"],
    ["a malformed URL", "https://"],
    ["a nested subdomain", "https://a.b.vercel.app"],
  ])("rejects %s, and never echoes secrets from it", (_label, line) => {
    const result = extractDeploymentUrl(`${line}\n`);
    expect(result, line).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/SECRET-/);
  });

  it("rejects text that merely contains a URL (prose is not a URL line)", () => {
    expect(extractDeploymentUrl(`Deployed to ${URL1} successfully`)).toMatchObject({ ok: false });
  });

  it("reports the unexpected hosts it saw (hostnames only), so the cause is visible", () => {
    const result = extractDeploymentUrl("https://one.example.com\nhttps://two.example.org\n");
    expect((result as { error: string }).error).toMatch(/one\.example\.com, two\.example\.org/);
  });
});

describe("scripts/ci/parse-deploy-url.mjs", () => {
  const run = (stdin: string) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = execFile(process.execPath, [path.join(process.cwd(), "scripts/ci/parse-deploy-url.mjs")], { env: { PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv }, (error, stdout, stderr) =>
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
      );
      child.stdin?.end(stdin);
    });

  it("prints exactly one line, the URL, for multi-line CLI output", async () => {
    const result = await run(`Notice: update available\n${URL1}\n`);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${URL1}\n`);
  });

  it("fails with a clear GitHub error and prints nothing on stdout (so $GITHUB_OUTPUT is never written) for bad input", async () => {
    for (const input of ["", "no url here\n", "https://evil.example.com\n"]) {
      const result = await run(input);
      expect(result.code, input).toBe(1);
      expect(result.stdout, input).toBe("");
      expect(result.stderr).toMatch(/::error::parse-deploy-url:/);
      expect(result.stderr).toMatch(/may already have been created/);
    }
  });

  it("does not leak a secret that appears in the CLI output", async () => {
    const result = await run("token=SECRET-IN-OUTPUT-0123456789\nhttps://evil.example.com/?k=SECRET-IN-OUTPUT-0123456789\n");
    expect(result.code).toBe(1);
    expect(result.stderr + result.stdout).not.toContain("SECRET-IN-OUTPUT");
  });
});
