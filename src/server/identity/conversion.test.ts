import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);

import { eq } from "drizzle-orm";
import { createAttempt, getAttemptViewForUser, getRecordingAudio, listAttemptSummaries } from "@/server/attempts/attempt-service";
import { processAttempt } from "@/server/attempts/attempt-processing";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, evaluations, practiceSessions, recordings, speakingAttempts, transcripts, users } from "@/server/db/schema";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting } from "@/server/transcription";
import { PASSWORD, signIn, signOut, signUp } from "../../../test/auth-helpers";
import { applySetCookies, jar } from "../../../test/next-headers-mock";
import { FIXTURE_TRANSCRIPT, fakeWebm, makeEvaluation } from "../../../test/fixtures";
import { getCurrentUser } from "./current-user";
import { mergeUsers } from "./merge-users";
import { USER_COOKIE_NAME } from "./user-cookie";

const TASK_ID = "b2-part2-advice-from-someone";
const ANON_1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const ANON_2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const ANON_3 = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";

let db: Db;
let dir: string;
let ip = 0;
const freshIp = () => `10.2.0.${++ip}`;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  resetAuthLimitersForTesting();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-conv-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  setTranscriptionProviderForTesting({ name: "fake-stt", model: "m", transcribe: async () => ({ text: FIXTURE_TRANSCRIPT, language: "en" }) });
  const llm: EvaluationModel = {
    provider: "fake-llm", model: "fake-llm-1", isDevelopmentProvider: false, config: {},
    evaluate: async () => ({ output: makeEvaluation(), provider: "fake-llm", model: "fake-llm-1", inputTokens: 10, outputTokens: 20 }),
  };
  setEvaluationModelForTesting(llm);
});
afterEach(async () => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A full anonymous practice (session, attempt, recording, transcript, evaluation, analytics) for `userId`. */
async function practise(userId: string, previousAttemptId: string | null = null) {
  await db.insert(users).values({ id: userId }).onConflictDoNothing().run();
  const attempt = await createAttempt({ userId, taskId: TASK_ID, audio: fakeWebm(), mimeType: "audio/webm;codecs=opus", durationMs: 90_000, previousAttemptId });
  await processAttempt(attempt.id);
  return attempt.id;
}

const counts = async () => ({
  attempts: (await db.select().from(speakingAttempts).all()).length,
  recordings: (await db.select().from(recordings).all()).length,
  transcripts: (await db.select().from(transcripts).all()).length,
  evaluations: (await db.select().from(evaluations).all()).length,
  sessions: (await db.select().from(practiceSessions).all()).length,
  events: (await db.select().from(analyticsEvents).all()).length,
});
const userId = async () => (await getCurrentUser()).userId;

describe("anonymous → account conversion at sign-up", () => {
  it("moves the whole anonymous history to the account, without copying anything", async () => {
    const first = await practise(ANON_1);
    const second = await practise(ANON_1, first);
    const before = await counts();
    const recordingIds = (await db.select({ id: recordings.id }).from(recordings).all()).map((r) => r.id);
    const evaluationIds = (await db.select({ id: evaluations.id }).from(evaluations).all()).map((r) => r.id);
    jar.set(USER_COOKIE_NAME, ANON_1);

    const response = await signUp("new@example.com", PASSWORD, { ip: freshIp() });
    expect(response.status).toBe(200);
    const accountId = await userId();
    expect((await getCurrentUser()).kind).toBe("authenticated");

    // Nothing was duplicated: same rows, same ids, now owned by the account.
    expect(await counts()).toEqual(before);
    expect((await db.select({ id: recordings.id }).from(recordings).all()).map((r) => r.id)).toEqual(recordingIds);
    expect((await db.select({ id: evaluations.id }).from(evaluations).all()).map((r) => r.id)).toEqual(evaluationIds);
    for (const row of await db.select().from(speakingAttempts).all()) expect(row.userId).toBe(accountId);
    for (const row of await db.select().from(practiceSessions).all()) expect(row.userId).toBe(accountId);
    for (const row of await db.select().from(analyticsEvents).all()) expect(row.userId).toBe(accountId);

    // Everything is reachable through the canonical account id, including audio and the retry chain.
    expect(await getAttemptViewForUser(accountId, first)).toMatchObject({ status: "completed", attemptNumber: 1 });
    expect(await getAttemptViewForUser(accountId, second)).toMatchObject({ status: "completed", attemptNumber: 2, previousAttemptId: first });
    expect((await getAttemptViewForUser(accountId, second)).evaluation).not.toBeNull();
    expect((await getRecordingAudio(accountId, first)).data.byteLength).toBeGreaterThan(0);
    expect((await listAttemptSummaries(accountId, TASK_ID)).map((a) => a.attemptNumber)).toEqual([2, 1]);

    // The anonymous identity is a tombstone and has no access any more.
    expect(await db.select().from(users).where(eq(users.id, ANON_1)).get()).toMatchObject({ kind: "anonymous", mergedIntoUserId: accountId });
    await expect(getAttemptViewForUser(ANON_1, first)).rejects.toThrow(/could not be found/);
    await expect(getRecordingAudio(ANON_1, first)).rejects.toThrow();
    expect(await listAttemptSummaries(ANON_1, TASK_ID)).toEqual([]);

    // The anonymous cookie was cleared in the response, and practice continues on the account.
    expect(jar.has(USER_COOKIE_NAME)).toBe(false);
    const third = await practise(accountId, second);
    expect(await getAttemptViewForUser(accountId, third)).toMatchObject({ attemptNumber: 3, previousAttemptId: second, status: "completed" });
  });

  it("works with nothing to convert (no cookie, a stale cookie, an unknown id)", async () => {
    expect((await signUp("a@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200);
    jar.clear();
    jar.set(USER_COOKIE_NAME, "not-a-uuid");
    expect((await signUp("b@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200);
    jar.clear();
    jar.set(USER_COOKIE_NAME, ANON_3); // well-formed but never seen by the server
    expect((await signUp("c@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, ANON_3)).all()).toHaveLength(0);
  });
});

describe("anonymous → existing account (sign-in)", () => {
  it("merges two histories for the same task into one chronological sequence", async () => {
    const existing = await practise(ANON_1);
    jar.set(USER_COOKIE_NAME, ANON_1);
    await signUp("owner@example.com", PASSWORD, { ip: freshIp() });
    const accountId = await userId();
    await signOut();

    // A different browser practises anonymously on the same task, then signs in to the same account.
    await new Promise((r) => setTimeout(r, 5)); // distinct created_at ordering
    const other = await practise(ANON_2);
    jar.clear();
    jar.set(USER_COOKIE_NAME, ANON_2);
    const response = await signIn("owner@example.com", PASSWORD, { ip: freshIp() });
    expect(response.status).toBe(200);

    expect(await userId()).toBe(accountId);
    expect((await listAttemptSummaries(accountId, TASK_ID)).map((a) => [a.id, a.attemptNumber])).toEqual([[other, 2], [existing, 1]]);
    expect((await db.select().from(users).where(eq(users.id, ANON_2)).get())?.mergedIntoUserId).toBe(accountId);
    expect(jar.has(USER_COOKIE_NAME)).toBe(false);
  });

  it("attaches several anonymous identities (several devices) to the same account over time", async () => {
    await signUp("multi@example.com", PASSWORD, { ip: freshIp() });
    const accountId = await userId();
    await signOut();
    for (const anon of [ANON_1, ANON_2, ANON_3]) {
      await practise(anon);
      jar.clear();
      jar.set(USER_COOKIE_NAME, anon);
      await signIn("multi@example.com", PASSWORD, { ip: freshIp() });
      await signOut();
    }
    expect((await listAttemptSummaries(accountId, TASK_ID)).map((a) => a.attemptNumber).sort()).toEqual([1, 2, 3]);
    expect((await counts()).attempts).toBe(3);
  });

  it("is idempotent: signing in again with the same anonymous cookie changes nothing", async () => {
    await practise(ANON_1);
    jar.set(USER_COOKIE_NAME, ANON_1);
    await signUp("again@example.com", PASSWORD, { ip: freshIp() });
    const accountId = await userId();
    await signOut();
    const before = await counts();

    jar.set(USER_COOKIE_NAME, ANON_1); // a retried login still carrying the stale cookie
    expect((await signIn("again@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200);
    expect(await counts()).toEqual(before);
    expect(await listAttemptSummaries(accountId, TASK_ID)).toHaveLength(1);
    expect(await mergeUsers(db, { fromUserId: ANON_1, intoUserId: accountId })).toMatchObject({ alreadyMerged: true, attemptsMoved: 0 });
  });
});

describe("a presented anonymous cookie cannot be used to take someone else's data", () => {
  it("ignores an ACCOUNT id, a merged id, and an id in the request body", async () => {
    // Victim account with data.
    const victimAttempt = await practise(ANON_1);
    jar.set(USER_COOKIE_NAME, ANON_1);
    await signUp("victim@example.com", PASSWORD, { ip: freshIp() });
    const victimId = await userId();
    await signOut();
    jar.clear();
    // Another anonymous browser with data that must not move.
    await practise(ANON_2);

    // The attacker registers while presenting the victim's account id (and the victim's tombstoned anonymous id).
    for (const presented of [victimId, ANON_1]) {
      jar.clear();
      jar.set(USER_COOKIE_NAME, presented);
      const attackerEmail = `attacker-${presented.slice(0, 4)}@example.com`;
      expect((await signUp(attackerEmail, PASSWORD, { ip: freshIp() })).status).toBe(200);
      const attackerId = await userId();
      expect(attackerId).not.toBe(victimId);
      expect((await getAttemptViewForUser(victimId, victimAttempt)).status).toBe("completed"); // still the victim's
      await expect(getAttemptViewForUser(attackerId, victimAttempt)).rejects.toThrow(/could not be found/);
      await signOut();
    }
    expect((await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, victimAttempt)).get())?.userId).toBe(victimId);

    // An id supplied in the request body is never read.
    jar.clear();
    const { authRequest } = await import("../../../test/auth-helpers");
    const response = await authRequest("/sign-up/email", { email: "body@example.com", password: PASSWORD, name: "b", anonymousUserId: ANON_2, userId: ANON_2 }, { ip: freshIp() });
    applySetCookies(response);
    expect(response.status).toBe(200);
    const bodyUser = await userId();
    expect(await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, ANON_2)).all()).toHaveLength(1);
    expect(await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, bodyUser)).all()).toHaveLength(0);
  });

  it("an old anonymous cookie does not authenticate as the account after conversion", async () => {
    const attemptId = await practise(ANON_1);
    jar.set(USER_COOKIE_NAME, ANON_1);
    await signUp("owner@example.com", PASSWORD, { ip: freshIp() });
    const accountId = await userId();
    await signOut();

    jar.clear();
    jar.set(USER_COOKIE_NAME, ANON_1); // the old cookie, replayed by someone else
    const caller = await getCurrentUser();
    expect(caller.kind).toBe("anonymous");
    expect(caller.userId).not.toBe(accountId);
    expect(caller.userId).not.toBe(ANON_1);
    await expect(getAttemptViewForUser(caller.userId, attemptId)).rejects.toThrow(/could not be found/);
  });
});
