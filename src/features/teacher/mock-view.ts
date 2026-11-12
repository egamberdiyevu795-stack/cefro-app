/**
 * T6 "Student's mock" as a teacher reads it (docs/v1-plan.md, section 5): the plain data the page draws, shared by the real
 * server (`teacher-service.ts`) and the demo teacher (`demo-mock.ts`). JSON-safe and browser-safe: no database, no provider.
 */
import { examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";
import { isMockLevel, type MockLevel } from "@/domain/teacher/rules";
import type { MockStatus } from "@/domain/speaking/full-mock";
import { ESTIMATE_NOT_READY, SPEAKING_ONLY_LINE, estimateSpeakingLevel, type EstimatedLevel, type PartBands } from "@/domain/speaking/mock-level";
import { formatDate } from "@/features/history/view-model";
import type { MockPartBand, MockPartState, NotScoredReason } from "@/features/mock-result/part-source";
import type { TranscriptFixesView } from "@/features/result/transcript-fixes";
import type { BandLabel } from "@/features/result/view-model";
import type { TeacherRating } from "./view-model";

/** What the teacher's player is given for one answer. `playable`: `src` is the teacher's own audio route. */
export type TeacherListen =
  | { state: "playable"; src: string; durationMs: number }
  | { state: "deleted"; deletedAt: string; durationMs: number };

export interface TeacherMockPartView {
  part: ExamPartId;
  attemptId: string | null;
  taskTitle: string | null;
  state: MockPartState;
  reason: NotScoredReason | null;
  /** The app's band for the part (CEFRO), when scored. */
  band: MockPartBand | null;
  /** The part's own band labels, for "Choose level". */
  bands: BandLabel[];
  transcript: string | null;
  /** The transcript with sentences to improve (the new sentence view); null: plain transcript. */
  fixes: TranscriptFixesView | null;
  listen: TeacherListen | null;
  rating: TeacherRating | null;
}

/** The teacher's level for the whole mock: Agree with the estimate, or their own level. */
export type TeacherMockRating = { agrees: true } | { agrees: false; level: MockLevel };

export interface TeacherMockView {
  id: string;
  classId: string;
  memberId: string;
  studentName: string;
  status: MockStatus;
  createdAt: string;
  finishedAt: string | null;
  parts: TeacherMockPartView[];
  rating: TeacherMockRating | null;
}

/** "Finished" · "In progress" · "Not finished" (closed after 24 hours). */
export const MOCK_STATUS_TEXT: Record<MockStatus, string> = { finished: "Finished", in_progress: "In progress", not_finished: "Not finished" };

const REASON_TEXT: Record<NotScoredReason, string> = {
  too_short: "Too short to rate",
  no_speech: "No speech found",
  ai_pending: "AI score not ready yet",
  failed: "Not scored",
};

/** What stands in place of a CEFRO band: "Not done", "Scoring…", "AI score not ready yet" … null when scored. */
export function partStatusText(part: Pick<TeacherMockPartView, "part" | "state" | "reason">): string | null {
  switch (part.state) {
    case "scored":
      return null;
    case "scoring":
      return `Scoring ${examPartLabel(part.part)}…`;
    case "not_done":
      return "Not done";
    case "not_scored":
      return REASON_TEXT[part.reason ?? "failed"];
  }
}

/** The app's estimate for the mock, from its parts' bands (docs/official-scale.md rule); null while it can't be given. */
export function appEstimate(parts: readonly Pick<TeacherMockPartView, "part" | "state" | "band">[]): EstimatedLevel | null {
  const bands: PartBands = {};
  for (const p of parts) bands[p.part] = p.state === "scored" && p.band ? p.band.band : null;
  const estimate = estimateSpeakingLevel(bands);
  return estimate.kind === "ready" ? estimate.level : null;
}

export interface TeacherMockHeader {
  title: string;
  date: string;
  statusText: string;
  /** "Not finished. This mock took longer than 24 hours…" for a closed mock. */
  note: string | null;
  estimate: EstimatedLevel | null;
  estimateText: string;
  line: typeof SPEAKING_ONLY_LINE;
  /** "You: Agree" / "You: B2" for the whole mock, when rated. */
  ratingText: string | null;
}

export function teacherMockHeader(mock: Pick<TeacherMockView, "createdAt" | "status" | "parts" | "rating">): TeacherMockHeader {
  const estimate = appEstimate(mock.parts);
  const date = formatDate(mock.createdAt);
  return {
    title: `Mock exam · ${date}`,
    date,
    statusText: MOCK_STATUS_TEXT[mock.status],
    note: mock.status === "not_finished" ? "This mock took longer than 24 hours, so it is closed. The parts that were finished keep their results." : null,
    estimate,
    estimateText: estimate ?? ESTIMATE_NOT_READY,
    line: SPEAKING_ONLY_LINE,
    ratingText: mock.rating ? (mock.rating.agrees ? "You: Agree" : `You: ${mock.rating.level}`) : null,
  };
}

/** A body read from the request: Agree, or a level from the list. */
export function parseMockRating(body: unknown): TeacherMockRating | null {
  const b = (body ?? {}) as { agrees?: unknown; level?: unknown };
  if (b.agrees === true) return { agrees: true };
  if (b.agrees === false && isMockLevel(b.level)) return { agrees: false, level: b.level };
  return null;
}

/** "B2 · 10.11.26", "Not finished · 10.11.26", for T3's "Last mock" and T4's mock rows. */
export function lastMockText(mock: { status: MockStatus; createdAt: string; level: EstimatedLevel | null }): string {
  const date = formatDate(mock.createdAt);
  if (mock.status === "not_finished") return `Not finished · ${date}`;
  if (mock.status === "in_progress") return `In progress · ${date}`;
  return `${mock.level ?? "Not ready"} · ${date}`;
}
