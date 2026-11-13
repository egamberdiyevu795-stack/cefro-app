#!/usr/bin/env node
/**
 * Signed-out page screenshots for docs/design-system/: home, sign in and Create account, at 1440 px (laptop) and 390 px (phone).
 *
 *   node scripts/screenshots/entry.mjs [--out docs/design-system] [--port 3200]
 *
 * Same safeguards as dashboard.mjs: its own `next dev` with the MOCK transcription and evaluation providers (no API key is
 * passed on), on a fresh SQLite database under data/screenshots/, never a hosted one (it refuses to start when an .env
 * file sets TURSO_*). These are the real pages (no `?mock=1`, so no demo label): what a student sees. Each shot is audited:
 * no horizontal scroll, no text under 11 px, exactly one black control. Takes under a minute.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const ROOT = process.cwd();
const OUT = path.resolve(ROOT, arg("out", "docs/design-system"));
const PORT = Number(arg("port", "3200"));
const BASE = `http://localhost:${PORT}`;
const RUN_DIR = path.join(ROOT, "data", "screenshots", `entry-${Date.now()}`);

for (const file of fs.readdirSync(ROOT).filter((f) => f.startsWith(".env") && f !== ".env.example")) {
  if (/^\s*(export\s+)?TURSO_(DATABASE_URL|AUTH_TOKEN)\s*=\s*\S/m.test(fs.readFileSync(path.join(ROOT, file), "utf8"))) {
    throw new Error(`${file} sets TURSO_* (a hosted database). Screenshots only run on a local throwaway database.`);
  }
}
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(_API_KEY|^TURSO_|^VERCEL)/.test(key)));
Object.assign(env, {
  TRANSCRIPTION_PROVIDER: "mock",
  TRANSCRIPTION_FALLBACK_PROVIDER: "none",
  EVALUATION_PROVIDER: "mock",
  AUDIO_ASSESSMENT: "off",
  DATABASE_PATH: path.join(RUN_DIR, "screenshots.db"),
  AUDIO_STORAGE_PROVIDER: "local",
  AUDIO_STORAGE_DIR: path.join(RUN_DIR, "audio"),
  NODE_ENV: "development",
});

const PAGES = [
  { name: "home", url: "/" },
  { name: "sign-in", url: "/login" },
  { name: "create-account", url: "/register" },
];
const SIZES = [["desktop", 1440, 900], ["phone", 390, 844]];

fs.mkdirSync(RUN_DIR, { recursive: true });
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let browser;
try {
  for (let i = 0; ; i++) {
    if (i > 90) throw new Error(`next dev did not start:\n${serverLog}`);
    try {
      if ((await fetch(`${BASE}/login`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(2000);
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  for (const { name, url } of PAGES) {
    for (const [suffix, width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE}${url}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (url !== "/") await page.locator("button[type=submit]:not([disabled])").waitFor(); // the page is ready
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      const audit = await page.evaluate(() => {
        let minFont = Infinity;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !n.textContent.trim() || el.closest("nextjs-portal, .sr-only")) continue;
          const box = el.getBoundingClientRect();
          if (box.width && box.height) minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
        }
        return {
          sideScroll: document.documentElement.scrollWidth > innerWidth,
          minFont,
          black: [...document.querySelectorAll("a, button")].filter((el) => {
            const box = el.getBoundingClientRect();
            return box.width && box.height && getComputedStyle(el).backgroundColor === "rgb(21, 21, 23)";
          }).length,
        };
      });
      if (audit.sideScroll || audit.minFont < 11 || audit.black !== 1) throw new Error(`${name} ${suffix}: ${JSON.stringify(audit)}`);
      // The whole page in one viewport (the phone page is taller than the screen).
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(height, full) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `entry-${name}-${suffix}.png`) });
    }
    console.log(`✓ entry-${name}`);
  }
  console.log(`Done: ${OUT}`);
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
}
