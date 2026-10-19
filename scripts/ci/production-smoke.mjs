#!/usr/bin/env node
// Browser-like smoke test of a deployed CEFRO, as a visitor: it needs no credentials and prints no cookie values.
//
//   node scripts/ci/production-smoke.mjs https://<name>.vercel.app
//
// It follows what a browser does: load the practice page (the proxy hands out the anonymous-identity cookie), then call
// the API with that cookie: account, session, upload a tiny (invalid) recording, and poll the attempt. It reports, per
// request, the status, whether a Set-Cookie came back and whether it changed the identity, and the Vercel region that
// served it. The point is to tell apart "the server cannot find the attempt" from "the browser's identity changed":
//   - the attempt is visible to the same cookie  -> the server side is fine;
//   - the attempt is a 404 to the same cookie     -> the server (database, region, instance) loses it;
//   - every API response sets a NEW identity      -> the cookie is not being kept, so each request is a new visitor.
// It writes what any visitor writes (an anonymous user, a practice session, one failed attempt with a tiny recording).
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TASK_ID = "b2-part2-technology-young-people";
const COOKIE = "cefro_uid";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Only a Vercel deployment host over https: this script is not a general-purpose request tool. */
export function assertAllowedBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("the address is not a URL");
  }
  const plain = url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && (url.pathname === "/" || url.pathname === "") && url.search === "" && url.hash === "";
  if (!plain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(url.hostname)) throw new Error("only a plain https://<name>.vercel.app address is accepted");
  return `https://${url.hostname}`;
}

/** The name/value pairs of the Set-Cookie headers of a response (values are used for comparison only, never printed). */
export function readSetCookies(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return raw.map((line) => {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(), secure: /;\s*secure/i.test(line), sameSite: /;\s*samesite=(\w+)/i.exec(line)?.[1]?.toLowerCase() };
  });
}

const regionOf = (response) => (response.headers.get("x-vercel-id") ?? "").split("::")[0] || "unknown";

/**
 * @param {{ base: string, fetchImpl?: typeof fetch, log?: (line: string) => void, polls?: number, pollDelayMs?: number }} options
 * @returns {Promise<{ cookieKept: boolean, attemptVisible: boolean, identityChanges: number, statuses: number[] }>}
 */
export async function smoke({ base, fetchImpl = fetch, log = console.log, polls = 6, pollDelayMs = 2000 }) {
  const jar = new Map();
  let identityChanges = 0;

  async function call(label, route, init = {}, { cookie = true } = {}) {
    const headers = { ...(init.headers ?? {}) };
    if (cookie && jar.size > 0) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetchImpl(`${base}${route}`, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const cookies = cookie ? readSetCookies(response) : [];
    let note = "";
    for (const c of cookies) {
      if (c.name === COOKIE) {
        const previous = jar.get(COOKIE);
        note = previous === undefined ? ` Set-Cookie ${COOKIE} (new, secure=${c.secure}, samesite=${c.sameSite ?? "none"})` : previous === c.value ? ` Set-Cookie ${COOKIE} (same)` : ` Set-Cookie ${COOKIE} (CHANGED identity)`;
        if (previous !== undefined && previous !== c.value) identityChanges++;
      }
      jar.set(c.name, c.value);
    }
    log(`${label}: HTTP ${response.status}${note} [${regionOf(response)}]`);
    return response;
  }

  const page = await call("1. practice page", `/practice/speaking/${TASK_ID}`);
  await page.arrayBuffer().catch(() => undefined);
  const cookieKept = jar.has(COOKIE);
  if (!cookieKept) log("   no identity cookie came back with the page");

  const me = await call("2. GET /api/account/me", "/api/account/me");
  await me.arrayBuffer().catch(() => undefined);
  const session = await call("3. POST /api/sessions", "/api/sessions", { method: "POST" });
  const sessionId = (await session.json().catch(() => ({}))).sessionId;

  const audio = new Uint8Array(4096).fill(1);
  audio.set([0x1a, 0x45, 0xdf, 0xa3], 0); // a WebM header, then noise: enough to be accepted as an upload
  const form = new FormData();
  form.set("audio", new Blob([audio], { type: "audio/webm" }), "smoke.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "3000");
  if (typeof sessionId === "string") form.set("sessionId", sessionId);
  const created = await call("4. POST /api/speaking/attempts", "/api/speaking/attempts", { method: "POST", body: form });
  const body = await created.json().catch(() => ({}));
  const attemptId = body?.attempt?.id;
  if (!created.ok || typeof attemptId !== "string") {
    log(`   the upload was not accepted (${body?.error?.code ?? "no error code"})`);
    return { cookieKept, attemptVisible: false, identityChanges, statuses: [created.status] };
  }

  const statuses = [];
  let attemptVisible = false;
  for (let i = 1; i <= polls; i++) {
    await sleep(pollDelayMs);
    const poll = await call(`5.${i} GET attempt (same identity)`, `/api/speaking/attempts/${attemptId}`);
    statuses.push(poll.status);
    const view = await poll.json().catch(() => ({}));
    if (poll.ok) {
      attemptVisible = true;
      log(`   attempt status: ${view?.attempt?.status ?? "?"}${view?.attempt?.failure?.code ? `, failure ${view.attempt.failure.code}` : ""}`);
    } else {
      log(`   error code: ${view?.error?.code ?? "none"}`);
    }
  }

  const control = await call("6. GET attempt WITHOUT the cookie (control: a different visitor)", `/api/speaking/attempts/${attemptId}`, {}, { cookie: false });
  await control.arrayBuffer().catch(() => undefined);

  log("");
  log(`cookie kept after the page: ${cookieKept ? "yes" : "NO"}`);
  log(`identity changed during the flow: ${identityChanges === 0 ? "no" : `YES (${identityChanges}x)`}`);
  log(`attempt visible to the identity that created it: ${attemptVisible ? "yes" : "NO"} (poll statuses: ${statuses.join(", ")})`);
  return { cookieKept, attemptVisible, identityChanges, statuses };
}

async function main() {
  let base;
  try {
    base = assertAllowedBase(process.argv[2] ?? "");
  } catch (error) {
    console.error(`::error::production-smoke: ${error instanceof Error ? error.message : "bad address"}`);
    process.exit(1);
  }
  try {
    const result = await smoke({ base });
    if (!result.attemptVisible || !result.cookieKept || result.identityChanges > 0) process.exit(1);
  } catch (error) {
    console.error(`::error::production-smoke: ${error instanceof Error ? error.message : "request failed"}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
