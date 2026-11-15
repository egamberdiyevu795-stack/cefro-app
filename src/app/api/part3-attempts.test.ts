import { listArgumentTasks } from "@/content/speaking/part3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
/** Part 3 is not live in the app (PART_LIVE["3"] = false). These tests turn it on, and one turns it off again. */
const live = vi.hoisted(() => ({ part3: true }));
vi.mock("@/config/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/features")>();
  return {
    ...original,
    PART_LIVE: {
      "1.1": false,
      "1.2": false,
      "2": true,
      get "3"() {
        return live.part3;
      },
    },
  };
});
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 60_000 });

import { eq } from "drizzle-orm";
import { setConsentRequiredForTesting } from "@/server/consent/consent";
import { dashboardFix, dashboardView, partTiles, scoredAttempts } from "@/features/dashboard/progress";
import { getArgumentTask } from "@/content/speaking/part3";
import { Part3AttemptResult } from "@/features/part3/Part3AttemptResult";
import { Part3Practice } from "@/features/part3/Part3Practice";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { recordings, speakingAttempts, users } from "@/server/db/schema";
import { setArgumentEvaluationModelForTesting, type ArgumentEvaluationModel } from "@/server/evaluation";
import { ProviderError } from "@/server/errors";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { PASSWORD, signUp } from "../../../test/auth-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { jar } from "../../../test/next-headers-mock";
import HistoryPage from "../history/page";
import Part3PracticePage from "../practice/part3/[taskId]/page";
import Part3ListPage from "../practice/part3/page";
import PracticePage from "../practice/page";
import ResultPage from "../result/[attemptId]/page";
import { POST as postProcess } from "./speaking/attempts/[attemptId]/process/route";
import { GET as getAudio } from "./speaking/attempts/[attemptId]/audio/route";
import { GET as getAttempt } from "./speaking/attempts/[attemptId]/route";
import { POST as postAttempt } from "./speaking/attempts/route";
import { GET as getTaskAttempts } from "./speaking/tasks/[taskId]/attempts/route";

/*
 * Part 3 through the real route handlers and pages (mock providers only, no model call): cross-user access like
 * cross-user.test.ts, the consent lock like Part 2's, "AI score not ready yet", History, the dashboard and the pages.
 */
const CARS = "c1-part3-cars-in-city-centres";
let db: Db;
let dir: string;
let ip = 0;
type Browser = Map<string, string>;
const browsers: Record<string, Browser> = {};

const as = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
async function register(name: string) {
  jar.clear();
  expect((await signUp(`${name}@example.com`, PASSWORD, { ip: `10.7.0.${++ip}` })).status).toBe(200);
  browsers[name] = new Map(jar);
}
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const json = async (response: Response) => (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const drain = async () => {
  while (afterTasks.length) await afterTasks.shift()!();
};

async function upload(fields: Record<string, string> = {}, taskId = CARS) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", taskId);
  form.set("durationMs", "110000");
  form.set("chosenPoints", JSON.stringify(["F1", "F2", "A1", "A2"]));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  await drain();
  return { response, body: await json(response) };
}
const attemptRows = async () => db.select().from(speakingAttempts).all();
const userId = async (name: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, `${name}@example.com`)).get())!.id;

beforeEach(async () => {
  live.part3 = true;
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-p3api-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  afterTasks.length = 0;
  await register("alice");
  await register("bob");
  browsers.anonymous = new Map();
});
afterEach(() => {
  setConsentRequiredForTesting(undefined);
  setArgumentEvaluationModelForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("real Part 3 attempts over the API", () => {
  it("alice uploads, the attempt is scored by the mock evaluator, and only she can read, play back, list or process it", async () => {
    as(browsers.alice);
    const { response, body } = await upload();
    expect(response.status).toBe(201);
    const id: string = body.attempt.id;

    const mine = await json(await getAttempt(new Request("http://localhost/x"), ctx({ attemptId: id })));
    expect(mine.attempt).toMatchObject({ status: "completed", taskId: CARS });
    expect(mine.attempt.evaluation.result).toMatchObject({ kind: "multilevel_q8", chosen_points: ["F1", "F2", "A1", "A2"] });
    expect(mine.attempt.evaluation.meta.schemaVersion).toBe(4);
    expect((await getAudio(new Request("http://localhost/x"), ctx({ attemptId: id }))).status).toBe(200);
    expect((await json(await getTaskAttempts(new Request("http://localhost/x"), ctx({ taskId: CARS })))).attempts.map((a: { id: string }) => a.id)).toEqual([id]);

    for (const other of [browsers.bob, browsers.anonymous]) {
      as(other);
      expect((await getAttempt(new Request("http://localhost/x"), ctx({ attemptId: id }))).status).toBe(404);
      expect((await getAudio(new Request("http://localhost/x"), ctx({ attemptId: id }))).status).toBe(404);
      expect((await postProcess(new Request("http://localhost/x", { method: "POST" }), ctx({ attemptId: id }))).status).toBe(404);
      expect((await json(await getTaskAttempts(new Request("http://localhost/x"), ctx({ taskId: CARS })))).attempts).toEqual([]);
    }
  });

  it("cannot retry someone else's Part 3 attempt", async () => {
    as(browsers.alice);
    const { body } = await upload();
    as(browsers.bob);
    const { response, body: refused } = await upload({ previousAttemptId: body.attempt.id });
    expect(response.status).toBe(400);
    expect(refused.error.code).toBe("invalid_previous_attempt");
    expect(await attemptRows()).toHaveLength(1);
  });

  it("is refused while PART_LIVE['3'] is off: nothing stored", async () => {
    live.part3 = false;
    as(browsers.alice);
    const { response, body } = await upload();
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("task_not_found");
    expect(await attemptRows()).toHaveLength(0);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it("Part 2 is unchanged: still accepted, with its own result kind", async () => {
    as(browsers.alice);
    const { response, body } = await upload({ chosenPoints: "" }, "b2-part2-advice-from-someone");
    expect(response.status).toBe(201);
    const view = await json(await getAttempt(new Request("http://localhost/x"), ctx({ attemptId: body.attempt.id })));
    expect(view.attempt.evaluation.result.kind).toBe("multilevel");
    expect(view.attempt.evaluation.meta.schemaVersion).toBe(3);
  });
});

describe("pilot consent: the Part 3 lock is exactly Part 2's (CONSENT_REQUIRED)", () => {
  const setConsent = (email: string, status: "granted" | "withdrawn" | null) =>
    db.update(users).set({ consentStatus: status, consentAt: new Date().toISOString() }).where(eq(users.email, email)).run();

  it("guests and accounts without consent never record: 403 consent_required, nothing read, stored or scored", async () => {
    setConsentRequiredForTesting(true);
    for (const [who, browser] of [["a guest", browsers.anonymous], ["an account without consent", browsers.alice]] as const) {
      as(browser);
      const { response, body } = await upload();
      expect(response.status, who).toBe(403);
      expect(body.error.code).toBe("consent_required");
    }
    await setConsent("bob@example.com", "withdrawn");
    as(browsers.bob);
    expect((await upload()).response.status).toBe(403);
    expect(await attemptRows()).toHaveLength(0);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it("consent_status granted records, and scoring a stored answer again needs consent too", async () => {
    await setConsent("alice@example.com", "granted");
    setConsentRequiredForTesting(true);
    as(browsers.alice);
    const failing: ArgumentEvaluationModel = {
      provider: "gemini", model: "x", isDevelopmentProvider: false, config: {},
      evaluate: async () => { throw new ProviderError("provider_rate_limited", "busy"); },
    };
    setArgumentEvaluationModelForTesting(failing);
    const { response, body } = await upload();
    expect(response.status).toBe(201);
    expect((await getAttemptViewStatus(body.attempt.id))).toBe("failed");

    // Consent withdrawn: the saved recording is not sent to the scoring provider again.
    await setConsent("alice@example.com", "withdrawn");
    const again = await postProcess(new Request("http://localhost/x", { method: "POST" }), ctx({ attemptId: body.attempt.id }));
    expect(again.status).toBe(403);
    expect((await json(again)).error.code).toBe("consent_required");
  });

  it("the real practice page asks the server: a guest gets the lock, a consenting account does not; the page 404s while Part 3 is off", async () => {
    await setConsent("alice@example.com", "granted");
    setConsentRequiredForTesting(true);
    const page = async () => ((await Part3PracticePage({ params: Promise.resolve({ taskId: CARS }), searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{ children: React.ReactElement<{ lock: string | null; mode: string }> }>).props.children;
    as(browsers.anonymous);
    expect((await page()).props).toMatchObject({ lock: "guest", mode: "real" });
    as(browsers.alice);
    expect((await page()).props).toMatchObject({ lock: null, mode: "real" });
    expect((await page()).type).toBe(Part3Practice);
    live.part3 = false;
    await expect(page()).rejects.toThrow();
  });
});

async function getAttemptViewStatus(id: string): Promise<string> {
  return (await json(await getAttempt(new Request("http://localhost/x"), ctx({ attemptId: id })))).attempt.status;
}

describe("the result page: /result/[attemptId] for a Part 3 attempt", () => {
  const open = async (id: string) => (await ResultPage({ params: Promise.resolve({ attemptId: id }) } as never)) as React.ReactElement<{ children: React.ReactElement<{ initial: { id: string }; task: { id: string } }> }>;

  it("opens the Part 3 result for its owner only; everyone else gets the not-found screen", async () => {
    as(browsers.alice);
    const { body } = await upload();
    const element = (await open(body.attempt.id)).props.children;
    expect(element.type).toBe(Part3AttemptResult);
    expect(element.props.initial.id).toBe(body.attempt.id);
    expect(element.props.task.id).toBe(CARS);
    expect(JSON.stringify(element.props)).not.toContain("evaluatorGuidance");
    for (const other of [browsers.bob, browsers.anonymous]) {
      as(other);
      await expect(open(body.attempt.id)).rejects.toThrow();
    }
  });

  it("an attempt whose AI scoring could not run still opens, with its transcript, and its audio plays", async () => {
    setArgumentEvaluationModelForTesting({
      provider: "gemini", model: "x", isDevelopmentProvider: false, config: {},
      evaluate: async () => { throw new ProviderError("provider_not_configured", "no key", { retryable: false }); },
    });
    as(browsers.alice);
    const { response, body } = await upload();
    expect(response.status).toBe(201);
    const element = (await open(body.attempt.id)).props.children;
    expect(element.props.initial).toMatchObject({ status: "failed", failure: { stage: "evaluation", code: "provider_not_configured" }, transcript: { text: expect.any(String) } });
    expect((await getAudio(new Request("http://localhost/x"), ctx({ attemptId: body.attempt.id }))).status).toBe(200);
    expect((await db.select().from(recordings).all())[0].audioDeletedAt).toBeNull();
  });
});

describe("History, dashboard and the task list show Part 3 attempts like Part 2", () => {
  it("History lists the Part 3 attempt as Part 3 with its level, filters by part 3, and shows only the owner's", async () => {
    as(browsers.alice);
    const { body } = await upload();
    const view = async (query: Record<string, string> = {}) =>
      ((await HistoryPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never)) as React.ReactElement<{ children: React.ReactElement<{ view: import("@/features/history/view-model").HistoryView }> }>).props.children.props.view;
    const all = await view();
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0]).toMatchObject({ id: body.attempt.id, partLabel: "Part 3", href: `/result/${body.attempt.id}`, outcome: { kind: "scored" } });
    expect(all.filters.map((f) => f.label)).toEqual(["All", "Part 3"]);
    expect((await view({ part: "3" })).rows).toHaveLength(1);
    as(browsers.bob);
    expect((await view()).total).toBe(0);
  });

  it("the dashboard: Recent attempts, the Part 3 tile's latest band, and a Part 3 biggest fix with its real retry link", async () => {
    as(browsers.alice);
    const { body } = await upload();
    const attempts = await listAttemptHistory(await userId("alice"));
    expect(attempts[0]).toMatchObject({ id: body.attempt.id, part: "3", status: "completed" });
    expect(dashboardView(attempts)).toBe("returning");
    expect(partTiles(attempts).find((t) => t.part === "3")).toMatchObject({ band: expect.any(Number), bandLabel: expect.any(String) });
    expect(partTiles(attempts).find((t) => t.part === "2")).toMatchObject({ band: null });
    const fix = dashboardFix(attempts, {
      prompts: () => [],
      transcript: "x",
      target: "B2",
      argumentPoints: (id) => getArgumentTask(id)?.points,
    });
    expect(fix?.retryHref).toBe(`/practice/part3/${CARS}?retry=${body.attempt.id}`);
    expect(fix?.fix.tryInstead).toBeTruthy();
    expect(scoredAttempts(attempts)).toHaveLength(1);
  });

  it("the task list offers the real Part 3 topics when live (no mock links) and 'Coming soon' when not", async () => {
    const hrefs = async () => {
      const page = (await PracticePage({ searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{ children: React.ReactElement<{ parts: { part: string; status: string; tasks: { href: string }[] }[] }> }>;
      return page.props.children.props.parts.find((p) => p.part === "3")!;
    };
    as(browsers.alice);
    const open = await hrefs();
    expect(open.status).toBe("open");
    expect(open.tasks.map((t) => t.href)).toEqual(listIds().map((id) => `/practice/part3/${id}`));
    live.part3 = false;
    expect(await hrefs()).toMatchObject({ status: "soon", tasks: [] });
  });

  it("the topics page: a 404 while Part 3 is off, a redirect to the task list when live (without ?mock=1)", async () => {
    const list = () => Part3ListPage({ searchParams: Promise.resolve({}) } as never);
    await expect(list()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    live.part3 = false;
    await expect(list()).rejects.toMatchObject({ digest: expect.not.stringContaining("NEXT_REDIRECT") });
  });
});

function listIds(): string[] {
  return listArgumentTasks().map((t) => t.id);
}
