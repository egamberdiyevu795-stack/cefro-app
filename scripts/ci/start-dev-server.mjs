#!/usr/bin/env node
// Starts `next dev` for a Playwright run, reliably. Used as the `webServer.command` of the browser-test configs
// (playwright.config.ts, .part3, .exam-laptop, .live); it changes nothing about the app.
//
//   node scripts/ci/start-dev-server.mjs <port>
//
// Why: the main browser suite sometimes failed with "Timed out waiting 120000ms from config.webServer" right after the unit
// tests, on a slow disk ("Slow filesystem detected"), while a cold start normally takes about 10 seconds. Two things made it
// likely, and this script handles both before it starts the server:
//   1. The port is still held. The previous server (or a test run) may still be shutting down, and the new server would then
//      not answer or would move to another port. It waits (up to 90 s) until nothing listens on the port.
//   2. The Turbopack dev cache (.next/dev/cache) grows with every run and was seen at 1.5 GB: opening it was slower than
//      compiling from scratch (11 s with the 1.5 GB cache, 6 s without, measured). A cache over 500 MB is a derived file and is
//      deleted. A smaller one is kept, so ordinary `npm run dev` use is not affected.
// The server's own stdout goes to data/e2e/dev-server-<port>.log (read it when a start still fails); stderr stays on screen.
// The script exits with the server's exit code and passes SIGTERM / SIGINT on to it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_DEV_CACHE_BYTES = 500 * 1024 * 1024;
export const PORT_WAIT_MS = 90_000;

/** Is something accepting connections on this port (IPv4 or IPv6 loopback)? */
export function isPortInUse(port, timeoutMs = 750) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host });
      const done = (inUse) => {
        socket.destroy();
        resolve(inUse);
      };
      socket.setTimeout(timeoutMs, () => done(false));
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    });
  return Promise.all([probe("127.0.0.1"), probe("::1")]).then(([a, b]) => a || b);
}

/** Resolves true once nothing listens on the port, false when `maxWaitMs` ran out first. */
export async function waitForPortFree(port, maxWaitMs = PORT_WAIT_MS, pollMs = 500) {
  const end = Date.now() + maxWaitMs;
  while (await isPortInUse(port)) {
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return true;
}

/** Total size in bytes of a directory tree (0 when it does not exist). Symbolic links are not followed. */
export function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirSizeBytes(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {
      // A file that vanished while counting is not worth failing for.
    }
  }
  return total;
}

/** Deletes the Turbopack dev cache when it is over the limit. Returns what it did, for the log line. */
export function trimDevCache(cacheDir, maxBytes = MAX_DEV_CACHE_BYTES) {
  const size = dirSizeBytes(cacheDir);
  if (size <= maxBytes) return { trimmed: false, bytes: size };
  fs.rmSync(cacheDir, { recursive: true, force: true });
  return { trimmed: true, bytes: size };
}

const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

async function main() {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error("start-dev-server: usage: node scripts/ci/start-dev-server.mjs <port 1024-65535>");
    process.exit(2);
  }
  const started = Date.now();
  const free = await waitForPortFree(port);
  if (!free) {
    console.error(`start-dev-server: port ${port} is still in use after ${PORT_WAIT_MS / 1000} s: another server is running. Stop it and run again.`);
    process.exit(1);
  }
  const cache = trimDevCache(path.join(".next", "dev", "cache"));
  console.error(
    `start-dev-server: port ${port} free after ${((Date.now() - started) / 1000).toFixed(1)} s; dev cache ${mb(cache.bytes)}${cache.trimmed ? " (over the limit: deleted)" : " (kept)"}; starting next dev`,
  );

  fs.mkdirSync(path.join("data", "e2e"), { recursive: true });
  const logFile = path.join("data", "e2e", `dev-server-${port}.log`);
  const log = fs.openSync(logFile, "w");
  const child = spawn("npx", ["next", "dev", "-p", String(port)], { stdio: ["ignore", log, "inherit"], env: process.env });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
