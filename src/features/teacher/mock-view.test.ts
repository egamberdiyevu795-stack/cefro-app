import { describe, expect, it } from "vitest";
import { appEstimate, lastMockText, parseMockRating, partStatusText, teacherMockHeader, type TeacherMockPartView, type TeacherMockView } from "./mock-view";

const part = (id: TeacherMockPartView["part"], over: Partial<TeacherMockPartView> = {}): TeacherMockPartView => ({
  part: id,
  attemptId: `a-${id}`,
  taskTitle: "t",
  state: "scored",
  reason: null,
  band: { band: 3, label: "Lower B2", bandMax: 5, targetBand: 3 },
  bands: [],
  transcript: "x",
  fixes: null,
  listen: null,
  rating: null,
  ...over,
});
const mock = (parts: TeacherMockPartView[], over: Partial<TeacherMockView> = {}): TeacherMockView => ({
  id: "m",
  classId: "c",
  memberId: "s",
  studentName: "Ali",
  status: "finished",
  createdAt: "2026-11-10T09:00:00.000Z",
  finishedAt: null,
  parts,
  rating: null,
  ...over,
});
const four = (over: Partial<Record<TeacherMockPartView["part"], Partial<TeacherMockPartView>>> = {}) => (["1.1", "1.2", "2", "3"] as const).map((id) => part(id, over[id]));

describe("T6 header", () => {
  it("estimated level, date and Finished", () => {
    const header = teacherMockHeader(mock(four()));
    expect(header).toMatchObject({ title: "Mock exam · 10.11.26", statusText: "Finished", estimate: "B2", estimateText: "B2", note: null, ratingText: null });
    expect(header.line).toBe("Speaking only. An estimate from this mock, not an official UZBMB score.");
  });

  it("Not finished says why and keeps the parts; the estimate waits for the parts the rule needs", () => {
    const notDone = { state: "not_done" as const, band: null, attemptId: null, taskTitle: null };
    const header = teacherMockHeader(mock(four({ "2": notDone, "3": notDone }), { status: "not_finished" }));
    expect(header.statusText).toBe("Not finished");
    expect(header.note).toMatch(/24 hours/);
    expect(header.estimate).toBeNull();
    expect(header.estimateText).toBe("Estimate not ready yet");
    expect(teacherMockHeader(mock(four(), { status: "in_progress" })).statusText).toBe("In progress");
  });

  it("the teacher's own level for the mock", () => {
    expect(teacherMockHeader(mock(four(), { rating: { agrees: true } })).ratingText).toBe("You: Agree");
    expect(teacherMockHeader(mock(four(), { rating: { agrees: false, level: "C1" } })).ratingText).toBe("You: C1");
  });

  it("what stands in place of a band", () => {
    expect(partStatusText({ part: "2", state: "scored", reason: null })).toBeNull();
    expect(partStatusText({ part: "2", state: "scoring", reason: null })).toBe("Scoring Part 2…");
    expect(partStatusText({ part: "3", state: "not_done", reason: null })).toBe("Not done");
    expect(partStatusText({ part: "3", state: "not_scored", reason: "ai_pending" })).toBe("AI score not ready yet");
    expect(partStatusText({ part: "1.2", state: "not_scored", reason: "too_short" })).toBe("Too short to rate");
    expect(appEstimate(four({ "3": { state: "not_scored", band: null } }))).toBeNull();
  });
});

describe("mock rating bodies and T3's last mock", () => {
  it("Agree, or a level from the list; nothing else", () => {
    expect(parseMockRating({ agrees: true })).toEqual({ agrees: true });
    expect(parseMockRating({ agrees: false, level: "Below B1" })).toEqual({ agrees: false, level: "Below B1" });
    for (const bad of [{ agrees: false, level: "A1" }, { agrees: false }, { level: "B2" }, null, "B2", { agrees: "yes" }]) expect(parseMockRating(bad)).toBeNull();
  });

  it("last mock: level and date, or its status", () => {
    expect(lastMockText({ status: "finished", createdAt: "2026-11-10T09:00:00.000Z", level: "B2" })).toBe("B2 · 10.11.26");
    expect(lastMockText({ status: "finished", createdAt: "2026-11-10T09:00:00.000Z", level: null })).toBe("Not ready · 10.11.26");
    expect(lastMockText({ status: "not_finished", createdAt: "2026-11-10T09:00:00.000Z", level: null })).toBe("Not finished · 10.11.26");
  });
});
