import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_DEV_CACHE_BYTES, dirSizeBytes, isPortInUse, trimDevCache, waitForPortFree } from "../../scripts/ci/start-dev-server.mjs";

/*
 * scripts/ci/start-dev-server.mjs: what the browser-test configs run instead of a bare `next dev`, so a start that follows
 * the unit tests does not time out. These tests never start Next.
 */

const servers: net.Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(() => resolve(undefined)))));
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function listen(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.destroy());
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
  });
}
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-devserver-"));
  dirs.push(dir);
  return dir;
}

describe("port checks", () => {
  it("sees a port that is held, and one that is free", async () => {
    const { server, port } = await listen();
    expect(await isPortInUse(port)).toBe(true);
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    expect(await isPortInUse(port)).toBe(false);
  });

  it("waitForPortFree answers true at once for a free port", async () => {
    const { server, port } = await listen();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    expect(await waitForPortFree(port, 2_000, 50)).toBe(true);
  });

  it("waitForPortFree waits for a port that is released a moment later, and gives up when it never is", async () => {
    const { server, port } = await listen();
    setTimeout(() => server.close(), 400);
    const started = Date.now();
    expect(await waitForPortFree(port, 5_000, 50)).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);

    const held = await listen();
    expect(await waitForPortFree(held.port, 600, 50)).toBe(false);
  });
});

describe("dev cache trimming", () => {
  it("counts a tree, and a missing directory is empty", () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "one"), Buffer.alloc(1000));
    fs.writeFileSync(path.join(dir, "a", "b", "two"), Buffer.alloc(234));
    expect(dirSizeBytes(dir)).toBe(1234);
    expect(dirSizeBytes(path.join(dir, "missing"))).toBe(0);
  });

  it("keeps a cache under the limit and deletes one over it", () => {
    const dir = tempDir();
    const cache = path.join(dir, "cache");
    fs.mkdirSync(cache);
    fs.writeFileSync(path.join(cache, "x"), Buffer.alloc(2048));
    expect(trimDevCache(cache, 4096)).toEqual({ trimmed: false, bytes: 2048 });
    expect(fs.existsSync(cache)).toBe(true);
    expect(trimDevCache(cache, 1024)).toEqual({ trimmed: true, bytes: 2048 });
    expect(fs.existsSync(cache)).toBe(false);
    // Nothing there: nothing to do, no error.
    expect(trimDevCache(cache, 1024)).toEqual({ trimmed: false, bytes: 0 });
  });

  it("the default limit is 500 MB", () => {
    expect(MAX_DEV_CACHE_BYTES).toBe(500 * 1024 * 1024);
  });
});

describe("the command", () => {
  const script = path.resolve("scripts/ci/start-dev-server.mjs");
  it("refuses a missing or invalid port without starting anything", () => {
    for (const args of [[], ["abc"], ["80"], ["70000"]]) {
      const run = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 20_000 });
      expect(run.status, args.join(" ")).toBe(2);
      expect(run.stderr).toContain("usage");
    }
  });

  it("every browser-test config that runs next dev goes through it, with a five-minute start limit", () => {
    for (const file of ["playwright.config.ts", "playwright.part3.config.ts", "playwright.exam-laptop.config.ts", "playwright.live.config.ts"]) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, file).toContain("node scripts/ci/start-dev-server.mjs ${PORT}");
      expect(text, file).not.toContain("command: `npx next dev");
      expect(text, file).toContain("timeout: 300_000");
    }
  });
});
