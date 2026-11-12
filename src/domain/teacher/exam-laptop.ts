import type { ExamPartId } from "@/domain/speaking/exam-part";
import { MOCK_PARTS, pickTaskForPart, type PickableTask, type TaskHistory } from "@/domain/speaking/full-mock";

/*
 * Exam laptop mode (docs/v1-plan.md section 6). Pure rules, no database: the server (server/exam-laptop) only loads rows
 * and asks these functions. Everything the plan decides is a constant here, so a test can pin it.
 */

/** A one-mock pass lasts about 30 minutes (a full mock is about 15). */
export const PASS_MINUTES = 30;
export const PASS_MS = PASS_MINUTES * 60 * 1000;
/** 5 wrong PINs on one laptop lock the student there until the teacher unlocks. */
export const MAX_PIN_FAILURES = 5;
/** Across every laptop: a student can't be guessed at by walking from room to room. */
export const MAX_PIN_FAILURES_TOTAL = 10;

export const ROOM_LABEL_MAX_LENGTH = 20;
export const DEFAULT_ROOM_LABEL = "Room 1";

export function isPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export const PIN_PROBLEM = "Use exactly 4 digits.";

/** The student's input as a PIN problem for the screen, or null. */
export function pinProblem(value: unknown): string | null {
  return isPin(value) ? null : PIN_PROBLEM;
}

/** "Room 2": 1–20 characters after trimming, no control characters. Null for nothing usable. */
export function normaliseRoomLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return label.length >= 1 && label.length <= ROOM_LABEL_MAX_LENGTH ? label : null;
}

/** The laptop's own random id: 16–64 characters of letters, digits, dash and underscore. */
export function isLaptopId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/* ------------------------------------------------------------------------------------------------- PIN failures */

export type PinFailures = Readonly<Record<string, number>>;

/** The stored `pin_failures` text as a map (anything unreadable is "no failures": a bad value never locks anyone out for good). */
export function parsePinFailures(stored: string | null | undefined): PinFailures {
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [laptop, n] of Object.entries(parsed as Record<string, unknown>)) if (typeof n === "number" && Number.isInteger(n) && n > 0) out[laptop] = n;
    return out;
  } catch {
    return {};
  }
}

export function serialisePinFailures(failures: PinFailures): string | null {
  const entries = Object.entries(failures).filter(([, n]) => n > 0);
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}

export const failuresOn = (failures: PinFailures, laptopId: string) => failures[laptopId] ?? 0;
export const totalFailures = (failures: PinFailures) => Object.values(failures).reduce((a, b) => a + b, 0);

/** Locked on this laptop: 5 wrong PINs here, or 10 on all laptops together. */
export function isLockedOn(failures: PinFailures, laptopId: string): boolean {
  return failuresOn(failures, laptopId) >= MAX_PIN_FAILURES || totalFailures(failures) >= MAX_PIN_FAILURES_TOTAL;
}

/** Locked on any laptop (the teacher's list shows "Locked" and an Unlock button). */
export function isLockedAnywhere(failures: PinFailures): boolean {
  return Object.values(failures).some((n) => n >= MAX_PIN_FAILURES) || totalFailures(failures) >= MAX_PIN_FAILURES_TOTAL;
}

export function addFailure(failures: PinFailures, laptopId: string): PinFailures {
  return { ...failures, [laptopId]: failuresOn(failures, laptopId) + 1 };
}

/** A correct PIN clears that laptop's count (the other laptops' counts stay). */
export function clearFailuresOn(failures: PinFailures, laptopId: string): PinFailures {
  const { [laptopId]: _gone, ...rest } = failures;
  void _gone;
  return rest;
}

/* ------------------------------------------------------------------------------------------------------ the pass */

export interface PassRow {
  classMockId: string;
  studentUserId: string;
  laptopId: string;
  sessionId: string | null;
  expiresAt: string;
  usedUpAt: string | null;
}

export type PassRefusal = "other_class_mock" | "wrong_student" | "other_laptop" | "expired" | "used_up" | "locked" | "class_mock_closed";

/**
 * May this laptop use this pass now? The order matters only for which word the test sees first; every one is a refusal.
 * `student`: whose account the request wants to act as (the pass's own student is the only one that works). `locked`: the
 * student is locked on this laptop (a pass made before the lock stops working at once).
 */
export function passRefusal(
  pass: PassRow,
  use: { classMockId: string; studentUserId?: string; laptopId: string; now: number; locked: boolean; classMockClosed: boolean },
): PassRefusal | null {
  if (pass.classMockId !== use.classMockId) return "other_class_mock";
  if (use.studentUserId !== undefined && pass.studentUserId !== use.studentUserId) return "wrong_student";
  if (pass.laptopId !== use.laptopId) return "other_laptop";
  if (pass.usedUpAt) return "used_up";
  if (Date.parse(pass.expiresAt) <= use.now) return "expired";
  if (use.locked) return "locked";
  if (use.classMockClosed) return "class_mock_closed";
  return null;
}

export const PASS_REFUSAL_MESSAGE: Record<PassRefusal, string> = {
  other_class_mock: "This pass is for another class mock.",
  wrong_student: "This pass is for another student.",
  other_laptop: "This pass belongs to another laptop.",
  expired: "This pass has run out. Ask the student to enter their PIN again.",
  used_up: "This mock is already finished on this laptop.",
  locked: "This student is locked on this laptop. Ask your teacher.",
  class_mock_closed: "This class mock is closed.",
};

export function passExpiry(now: number): string {
  return new Date(now + PASS_MS).toISOString();
}

/* -------------------------------------------------------------------------------------------------------- roster */

export type RosterState = "not_started" | "in_progress" | "done";

export interface RosterFacts {
  /** A mock of this class mock finished for the student. */
  finished: boolean;
  /** The label of the laptop holding an active (not used up, not expired) pass, or null. */
  activeRoom: string | null;
}

/** Not started / In progress (Room 2) / Done. A finished mock wins; an active pass makes the student unpickable elsewhere. */
export function rosterState(facts: RosterFacts): RosterState {
  if (facts.finished) return "done";
  return facts.activeRoom ? "in_progress" : "not_started";
}

export function rosterStateLabel(state: RosterState, room: string | null): string {
  if (state === "done") return "Done";
  if (state === "in_progress") return room ? `In progress (${room})` : "In progress";
  return "Not started";
}

/** Can the student be tapped on this laptop? Not when done, in progress anywhere else, without a PIN, or locked on this laptop. */
export function pickable(facts: RosterFacts & { hasPin: boolean; laptopId: string; activeLaptopId: string | null; lockedHere?: boolean }): boolean {
  if (!facts.hasPin || facts.lockedHere) return false;
  if (facts.finished) return false;
  return !facts.activeRoom || facts.activeLaptopId === facts.laptopId;
}

/* -------------------------------------------------------------------------------------------------------- paper */

export type PaperMode = "same" | "different";

export interface ClassPaper {
  /** One task id per part, or null for "a different paper for each student". */
  tasks: Partial<Record<ExamPartId, string>> | null;
}

export const isPaperMode = (value: unknown): value is PaperMode => value === "same" || value === "different";

/**
 * "Same paper for everyone": one task per part that NOBODY in the class has done (`classHistory` is every member's
 * attempts). When every task of a part has been done by someone, the least recently done one (pickTaskForPart's rule).
 */
export function suggestClassPaper<T extends PickableTask>(
  tasksFor: (part: ExamPartId) => readonly T[],
  classHistory: readonly TaskHistory[],
  random: () => number = Math.random,
): Partial<Record<ExamPartId, string>> {
  const paper: Partial<Record<ExamPartId, string>> = {};
  for (const part of MOCK_PARTS) {
    const pick = pickTaskForPart(tasksFor(part), classHistory, random);
    if (pick) paper[part] = pick.id;
  }
  return paper;
}

/** "Mock 3": numbered from the class's earlier class mocks. */
export const classMockTitle = (earlier: number) => `Mock ${earlier + 1}`;

/* ------------------------------------------------------------------------------------------------ in class / at home */

export type MockPlace = "in_class" | "at_home";
export const placeOfMock = (classMockId: string | null | undefined): MockPlace => (classMockId ? "in_class" : "at_home");
export const placeLabel = (place: MockPlace) => (place === "in_class" ? "In class" : "At home");

/* ------------------------------------------------------------------------------------------------------ messages */

export const EXAM_MESSAGES = {
  locked: "Too many wrong PINs. Ask your teacher to unlock you.",
  wrongPin: "That PIN isn't right.",
  noPin: "No PIN yet. Set one on your phone: Account, My classes.",
  inProgressElsewhere: "This student is taking the mock on another laptop.",
  alreadyDone: "This student has already done this mock.",
  closed: "This class mock is closed. No new mock can start.",
  needsPassword: "Enter your password to end the exam laptop.",
  wrongPassword: "That password isn't right.",
  needsCredentials: "Enter your email and password.",
  wrongCredentials: "That email and password don't match.",
} as const;
