#!/usr/bin/env node
/**
 * Dashboard screenshots for docs/design-system/, from real states of the real app.
 *
 *   node scripts/screenshots/dashboard.mjs [--out docs/design-system] [--port 3200]
 *
 * Starts its own `next dev` with the MOCK transcription and evaluation providers (no audio assessment, no API key
 * passed on), on a fresh SQLite database under data/screenshots/, then records answers through the practice page
 * with Chromium's fake microphone and photographs each dashboard state at 1440 px and 390 px (deviceScaleFactor 2).
 * Never calls a model: it refuses to start when an .env file would point the app at a hosted database, and stops if a
 * result was not scored by the mock evaluator. Each shot is audited: no horizontal scroll, no text under 11 px,
 * exactly one black button. Takes about 2 minutes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@libsql/client";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const ROOT = process.cwd();
const OUT = path.resolve(ROOT, arg("out", "docs/design-system"));
const PORT = Number(arg("port", "3200"));
const BASE = `http://localhost:${PORT}`;
const RUN_DIR = path.join(ROOT, "data", "screenshots", String(Date.now()));
const DB_PATH = path.join(RUN_DIR, "screenshots.db");

/* ── Mock providers only ─────────────────────────────────────────────────────────────────────────────────────── */

// `next dev` reads .env files for anything not already set, so a hosted database there would be used: refuse.
for (const file of fs.readdirSync(ROOT).filter((f) => f.startsWith(".env") && f !== ".env.example")) {
  if (/^\s*(export\s+)?TURSO_(DATABASE_URL|AUTH_TOKEN)\s*=\s*\S/m.test(fs.readFileSync(path.join(ROOT, file), "utf8"))) {
    throw new Error(`${file} sets TURSO_* (a hosted database). Screenshots only run on a local throwaway database.`);
  }
}
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/(_API_KEY|^TURSO_|^VERCEL)/.test(key)), // no keys, no hosted DB
);
Object.assign(env, {
  TRANSCRIPTION_PROVIDER: "mock",
  TRANSCRIPTION_FALLBACK_PROVIDER: "none",
  EVALUATION_PROVIDER: "mock",
  AUDIO_ASSESSMENT: "off",
  DATABASE_PATH: DB_PATH,
  AUDIO_STORAGE_PROVIDER: "local",
  AUDIO_STORAGE_DIR: path.join(RUN_DIR, "audio"),
  NODE_ENV: "development",
});

/* ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────── */

const db = () => createClient({ url: `file:${DB_PATH}` });
async function sql(query, args = []) {
  const client = db();
  try {
    return await client.execute({ sql: query, args });
  } finally {
    client.close();
  }
}
/** "YYYY-MM-DD", `n` days from today in Uzbekistan (the app's calendar). */
function day(n) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function record(page, task, { fail = false } = {}) {
  await page.goto(`${BASE}/practice/speaking/${task}`);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).waitFor();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await page.waitForURL(/\/result\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  await page.getByRole("heading", { name: /^Part 2 · Band/ }).waitFor({ timeout: 60_000 });
  // Proof that no model was called: the mock evaluator's own note is on the result.
  if (!(await page.getByText("Development evaluator.").count())) throw new Error("This result was not scored by the mock evaluator: stopping.");
  if (fail) await sql("UPDATE speaking_attempts SET status='failed', failure_stage='evaluation', failure_code='evaluation_failed' WHERE id=?", [id]);
  return id;
}

async function shoot(page, name, url = `${BASE}/dashboard`) {
  for (const [suffix, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const audit = await page.evaluate(() => {
      let minFont = Infinity;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.textContent.trim() || el.closest("nextjs-portal")) continue;
        const box = el.getBoundingClientRect();
        if (box.width && box.height) minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
      }
      return {
        sideScroll: document.documentElement.scrollWidth > innerWidth,
        minFont,
        black: document.querySelectorAll("main :is(a, button).bg-primary.text-on-primary").length,
      };
    });
    if (audit.sideScroll || audit.minFont < 11 || audit.black !== 1) throw new Error(`${name} ${suffix}: ${JSON.stringify(audit)}`);
    // The whole page in one viewport, so the phone's fixed bottom bar sits at the bottom; no Next.js dev badge.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.max(height, full) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `dashboard-${name}-${suffix}.png`) });
  }
  console.log(`✓ dashboard-${name}`);
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, permissions: ["microphone"] });
  return [context, await context.newPage()];
}

/* ── Run ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

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
      if ((await fetch(`${BASE}/dashboard`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(2000);
  }
  browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

  { const [c, p] = await newPage(browser); await shoot(p, "first-visit"); await c.close(); }
  { const [c, p] = await newPage(browser); await record(p, "b2-part2-advice-from-someone", { fail: true }); await shoot(p, "not-scored-yet"); await c.close(); }
  { const [c, p] = await newPage(browser); await record(p, "b2-part2-advice-from-someone"); await shoot(p, "one-answer"); await c.close(); }
  {
    // Five answers on four tasks, one a retry; then the exam date in each of its states.
    const [c, page] = await newPage(browser);
    const first = await record(page, "b2-part2-advice-from-someone");
    await record(page, "b2-part2-important-decision");
    await record(page, "b2-part2-a-tradition");
    await record(page, `b2-part2-advice-from-someone?retry=${first}`);
    await record(page, "b2-part2-happy-day");
    await shoot(page, "normal");
    await page.goto(`${BASE}/dashboard`);
    await page.getByLabel("When is your exam?").fill(day(23));
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByTestId("exam-countdown").waitFor();
    await shoot(page, "exam-date");
    await shoot(page, "flags-off", `${BASE}/dashboard?flags=off`);
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Edit exam date" }).click();
    await page.getByRole("button", { name: "Remove date" }).click();
    await page.getByRole("button", { name: "Add exam date" }).waitFor();
    await shoot(page, "exam-skipped");
    // A date that has passed: the app never saves one, so it is moved into the past in this throwaway database.
    const marker = day(612);
    await page.getByRole("button", { name: "Add exam date" }).click();
    await page.getByLabel("When is your exam?").fill(marker);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByTestId("exam-countdown").waitFor();
    await sql("UPDATE users SET exam_date=? WHERE exam_date=?", [day(-6), marker]);
    await shoot(page, "exam-passed");
    await c.close();
  }
  console.log(`Done: ${OUT}`);
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM"); // the whole `npx next dev` process group
  } catch {
    /* already gone */
  }
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
}
