import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.setConfig({ testTimeout: 30_000 });

import { eq } from "drizzle-orm";
import { getAnySpeakingTask } from "@/content/speaking";
import { LEGACY_SHARE_TEXT_VERSION, SHARE_TEXT_VERSION, canHearRecording, fullScopeFrom, memberScope, memberSeesAttempt, memberSeesMock, needsUpgradeAnswer } from "@/domain/teacher/rules";
import { ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { setConsentRequiredForTesting } from "@/server/consent/consent";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classMembers, classes, practiceSessions, recordings, users } from "@/server/db/schema";
import { seedAttempt } from "../../../test/db-helpers";
import { declineUpgrade, teacherCanHear, teacherCanSee, teacherCanSeeMock, upgradeMembership, listMemberships } from "./teacher-store";

/*
 * `teacherCanSee` (every part, mocks) and `teacherCanHear` (docs/v1-plan.md section 4.4): other teacher, ended membership,
 * before `shared_at`, consent withdrawn, audio deleted, plus the old Share wording and its one-time upgrade. Pure rules first,
 * then the same rules through the database.
 */

const T = (n: number) => `2026-11-0${n}T10:00:00.000Z`;
const PART_TASKS = { "1.1": "a2-part1-1-daily-life", "1.2": "b1-part1-2-shopping", "2": "b2-part2-a-tradition", "3": "c1-part3-cars-in-city-centres" } as const;

describe("the pure access rules", () => {
  const current = { sharedAt: T(2), shareTextVersion: SHARE_TEXT_VERSION, allPartsFrom: null };
  const legacy = { sharedAt: T(2), shareTextVersion: LEGACY_SHARE_TEXT_VERSION, allPartsFrom: null };

  it("the current wording shares every part made after Share, nothing before", () => {
    for (const part of ["1.1", "1.2", "2", "3"]) expect(memberSeesAttempt(current, { part, createdAt: T(3) }), part).toBe(true);
    expect(memberSeesAttempt(current, { part: "2", createdAt: T(1) })).toBe(false);
    expect(memberSeesAttempt(current, { part: "2", createdAt: T(2) })).toBe(false); // the instant of the tap is not "after"
    expect(memberScope(current)).toBe("all_parts_audio");
  });

  it("an old wording keeps Part 2 only, no mocks, no recordings, until the student taps", () => {
    expect(memberSeesAttempt(legacy, { part: "2", createdAt: T(3) })).toBe(true);
    for (const part of ["1.1", "1.2", "3", null]) expect(memberSeesAttempt(legacy, { part, createdAt: T(3) }), String(part)).toBe(false);
    expect(memberSeesMock(legacy, { createdAt: T(3) })).toBe(false);
    expect(canHearRecording({ sees: true, consentTeacherSharing: true, audioDeletedAt: null, hasRecording: true, member: legacy, attempt: { part: "2", createdAt: T(3) } })).toBe(false);
    expect(memberScope(legacy)).toBe("part2_only");
    expect(fullScopeFrom(legacy)).toBeNull();
    expect(needsUpgradeAnswer(legacy)).toBe(true);
  });

  it("after the upgrade everything is shared from the tap, and earlier attempts stay as they were", () => {
    const upgraded = { ...legacy, allPartsFrom: T(5) };
    expect(memberSeesAttempt(upgraded, { part: "3", createdAt: T(6) })).toBe(true);
    expect(memberSeesAttempt(upgraded, { part: "3", createdAt: T(4) })).toBe(false); // before the tap
    expect(memberSeesAttempt(upgraded, { part: "2", createdAt: T(4) })).toBe(true); // already shared under the old wording
    expect(memberSeesMock(upgraded, { createdAt: T(4) })).toBe(false);
    expect(memberSeesMock(upgraded, { createdAt: T(6) })).toBe(true);
    const hear = (createdAt: string, part = "2") => canHearRecording({ sees: true, consentTeacherSharing: true, audioDeletedAt: null, hasRecording: true, member: upgraded, attempt: { part, createdAt } });
    expect(hear(T(4))).toBe(false); // an old Part 2 attempt: text only, its audio was promised not to be shared
    expect(hear(T(6))).toBe(true);
    expect(needsUpgradeAnswer(upgraded)).toBe(false);
    expect(needsUpgradeAnswer({ ...legacy, upgradeDeclinedAt: T(4) })).toBe(false);
    expect(needsUpgradeAnswer({ ...current })).toBe(false);
  });

  it("teacherCanHear's three conditions are all needed", () => {
    const base = { sees: true, consentTeacherSharing: true, audioDeletedAt: null, hasRecording: true, member: current, attempt: { part: "2", createdAt: T(3) } };
    expect(canHearRecording(base)).toBe(true);
    expect(canHearRecording({ ...base, sees: false })).toBe(false);
    expect(canHearRecording({ ...base, consentTeacherSharing: false })).toBe(false);
    expect(canHearRecording({ ...base, audioDeletedAt: T(4) })).toBe(false);
    expect(canHearRecording({ ...base, hasRecording: false })).toBe(false);
  });
});

describe("teacherCanSee / teacherCanHear through the database", () => {
  let db: Db;
  beforeEach(async () => {
    db = await openDatabase(":memory:");
    setDbForTesting(db);
    setConsentRequiredForTesting(undefined);
    const consent = { consentStatus: "granted" as const, consentAt: T(1), consentTeacherSharing: true };
    await db
      .insert(users)
      .values([
        { id: "teacher", kind: "registered", role: "teacher", email: "t@example.com" },
        { id: "other", kind: "registered", role: "teacher", email: "o@example.com" },
        { id: "student", kind: "registered", email: "s@example.com", ...consent },
        { id: "stranger", kind: "registered", email: "x@example.com" },
      ])
      .run();
    await db.insert(classes).values({ id: "class", teacherUserId: "teacher", name: "Group B", joinCode: "ABC234" }).run();
    await db.insert(classes).values({ id: "other-class", teacherUserId: "other", name: "Other", joinCode: "ABC235" }).run();
  });
  afterEach(() => {
    setDbForTesting(undefined);
    setConsentRequiredForTesting(undefined);
  });

  const join = (over: Partial<typeof classMembers.$inferInsert> = {}) =>
    db.insert(classMembers).values({ id: "m1", classId: "class", studentUserId: "student", shownName: "Ali", sharedAt: T(2), shareTextVersion: SHARE_TEXT_VERSION, ...over }).run();

  async function attempt(part: keyof typeof PART_TASKS, createdAt: string, audio: { deleted?: boolean } | null = {}) {
    const task = getAnySpeakingTask(PART_TASKS[part])!;
    await ensureTaskSnapshot(task);
    const id = await seedAttempt(db, { userId: "student", taskId: task.id, taskVersion: task.version, createdAt });
    if (audio) {
      await db
        .insert(recordings)
        .values({ id: `r-${id}`, attemptId: id, storageProvider: "local", storageKey: `audio/${id}.webm`, mimeType: "audio/webm", sizeBytes: 4, durationMs: 1000, audioDeletedAt: audio.deleted ? T(8) : null })
        .run();
    }
    return id;
  }

  it("sees and hears all four parts after Share, for its own teacher only", async () => {
    await join();
    for (const part of Object.keys(PART_TASKS) as (keyof typeof PART_TASKS)[]) {
      const id = await attempt(part, T(3));
      expect(await teacherCanSee("teacher", id), `see ${part}`).toMatchObject({ classId: "class", memberId: "m1", studentUserId: "student" });
      expect(await teacherCanHear("teacher", id), `hear ${part}`).not.toBeNull();
      for (const who of ["other", "student", "stranger", "nobody"]) {
        expect(await teacherCanSee(who, id), `${who} sees ${part}`).toBeNull();
        expect(await teacherCanHear(who, id), `${who} hears ${part}`).toBeNull();
      }
    }
  });

  it("not before shared_at, and not after the membership ended or the class closed", async () => {
    await join();
    const early = await attempt("2", T(1));
    const later = await attempt("1.2", T(3));
    expect(await teacherCanSee("teacher", early)).toBeNull();
    expect(await teacherCanHear("teacher", early)).toBeNull();
    expect(await teacherCanHear("teacher", later)).not.toBeNull();

    await db.update(classMembers).set({ endedAt: T(4), endedBy: "student" }).where(eq(classMembers.id, "m1")).run();
    expect(await teacherCanSee("teacher", later)).toBeNull();
    expect(await teacherCanHear("teacher", later)).toBeNull();

    await db.update(classMembers).set({ endedAt: null, endedBy: null }).where(eq(classMembers.id, "m1")).run();
    expect(await teacherCanHear("teacher", later)).not.toBeNull();
    await db.update(classes).set({ closedAt: T(5) }).where(eq(classes.id, "class")).run();
    expect(await teacherCanSee("teacher", later)).toBeNull();
    expect(await teacherCanHear("teacher", later)).toBeNull();
  });

  it("consent withdrawn: the teacher no longer sees or hears, with the switch on; hearing needs the flag even with it off", async () => {
    await join();
    const id = await attempt("3", T(3));
    setConsentRequiredForTesting(true);
    expect(await teacherCanHear("teacher", id)).not.toBeNull();
    await db.update(users).set({ consentTeacherSharing: false }).where(eq(users.id, "student")).run();
    expect(await teacherCanSee("teacher", id)).toBeNull();
    expect(await teacherCanHear("teacher", id)).toBeNull();

    // Switch off (the default): the text is open as before, but audio still needs the recorded consent.
    setConsentRequiredForTesting(false);
    expect(await teacherCanSee("teacher", id)).not.toBeNull();
    expect(await teacherCanHear("teacher", id)).toBeNull();
    await db.update(users).set({ consentTeacherSharing: true, consentStatus: "withdrawn" }).where(eq(users.id, "student")).run();
    expect(await teacherCanHear("teacher", id)).toBeNull();
  });

  it("audio deleted (or never stored): seen, not heard", async () => {
    await join();
    const gone = await attempt("2", T(3), { deleted: true });
    const none = await attempt("1.1", T(3), null);
    expect(await teacherCanSee("teacher", gone)).not.toBeNull();
    expect(await teacherCanHear("teacher", gone)).toBeNull();
    expect(await teacherCanSee("teacher", none)).not.toBeNull();
    expect(await teacherCanHear("teacher", none)).toBeNull();
  });

  it("an old membership: Part 2 text only; the one-time card widens it from the tap; Not now changes nothing", async () => {
    await join({ shareTextVersion: LEGACY_SHARE_TEXT_VERSION });
    const p2 = await attempt("2", T(3));
    const p3 = await attempt("3", T(3));
    expect(await teacherCanSee("teacher", p2)).not.toBeNull();
    expect(await teacherCanHear("teacher", p2)).toBeNull(); // "Won't see: recordings" is what they agreed to
    expect(await teacherCanSee("teacher", p3)).toBeNull();
    expect((await listMemberships("student"))[0].needsUpgrade).toBe(true);

    await upgradeMembership("student", "m1");
    expect((await listMemberships("student"))[0].needsUpgrade).toBe(false);
    // Nothing from before the tap opens up.
    expect(await teacherCanSee("teacher", p3)).toBeNull();
    expect(await teacherCanHear("teacher", p2)).toBeNull();
    const after = await attempt("3", new Date(Date.now() + 60_000).toISOString());
    expect(await teacherCanSee("teacher", after)).not.toBeNull();
    expect(await teacherCanHear("teacher", after)).not.toBeNull();
    // Answering twice, or by a member of someone else's membership, is the same 404.
    await expect(upgradeMembership("student", "m1")).rejects.toMatchObject({ status: 404 });
    await expect(upgradeMembership("stranger", "m1")).rejects.toMatchObject({ status: 404 });
  });

  it("'Not now' keeps the old scope and the card does not come back", async () => {
    await join({ shareTextVersion: LEGACY_SHARE_TEXT_VERSION });
    await declineUpgrade("student", "m1");
    expect((await listMemberships("student"))[0].needsUpgrade).toBe(false);
    const p3 = await attempt("3", new Date(Date.now() + 60_000).toISOString());
    expect(await teacherCanSee("teacher", p3)).toBeNull();
    await expect(upgradeMembership("student", "m1")).rejects.toMatchObject({ status: 404 });
  });

  it("mocks: only full mocks started after the full scope began, never an old un-upgraded membership's", async () => {
    await join();
    await db.insert(practiceSessions).values([
      { id: "mock-new", userId: "student", kind: "full_mock", status: "finished", createdAt: T(3) },
      { id: "mock-old", userId: "student", kind: "full_mock", status: "finished", createdAt: T(1) },
      { id: "single", userId: "student", kind: "single_task", createdAt: T(3) },
    ]).run();
    expect(await teacherCanSeeMock("teacher", "mock-new")).toMatchObject({ classId: "class", studentUserId: "student" });
    expect(await teacherCanSeeMock("teacher", "mock-old")).toBeNull();
    expect(await teacherCanSeeMock("teacher", "single")).toBeNull();
    expect(await teacherCanSeeMock("other", "mock-new")).toBeNull();
    expect(await teacherCanSeeMock("student", "mock-new")).toBeNull();
    expect(await teacherCanSeeMock("teacher", "no-such-mock")).toBeNull();
    await db.update(classMembers).set({ endedAt: T(4), endedBy: "teacher" }).run();
    expect(await teacherCanSeeMock("teacher", "mock-new")).toBeNull();

    await db.delete(classMembers).run();
    await join({ shareTextVersion: LEGACY_SHARE_TEXT_VERSION });
    expect(await teacherCanSeeMock("teacher", "mock-new")).toBeNull();
  });
});
