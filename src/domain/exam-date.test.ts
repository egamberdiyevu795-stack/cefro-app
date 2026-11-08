import { describe, expect, it } from "vitest";
import { addDays, countdownLabel, daysBetween, examDateProblem, examDateState, formatDay, isCalendarDay, todayIn } from "./exam-date";

// 6 Nov 2026, 20:30 UTC = 7 Nov 01:30 in Tashkent.
const LATE = new Date("2026-11-06T20:30:00.000Z");
const NOON = new Date("2026-11-06T07:00:00.000Z");

describe("exam date", () => {
  it("today is Uzbekistan's day", () => {
    expect(todayIn(NOON)).toBe("2026-11-06");
    expect(todayIn(LATE)).toBe("2026-11-07");
  });

  it("accepts only real calendar days", () => {
    expect(isCalendarDay("2026-11-28")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("28.11.26")).toBe(false);
    expect(isCalendarDay(20261128)).toBe(false);
  });

  it("counts whole days, and says them plainly", () => {
    expect(daysBetween("2026-11-06", "2026-11-28")).toBe(22);
    expect(daysBetween("2026-11-06", "2027-03-28")).toBe(142); // across the year and a DST change elsewhere
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("in 1 day");
    expect(countdownLabel(23)).toBe("in 23 days");
    expect(formatDay("2026-11-28")).toBe("28.11.26");
  });

  it("dashboard state: ask, countdown, ask again once passed, or nothing after Skip", () => {
    const none = { examDate: null, examDateSkippedAt: null };
    expect(examDateState(none, NOON)).toEqual({ kind: "ask" });
    expect(examDateState({ ...none, examDate: "2026-11-28" }, NOON)).toEqual({ kind: "countdown", date: "2026-11-28", days: 22, label: "in 22 days" });
    expect(examDateState({ ...none, examDate: "2026-11-06" }, NOON)).toMatchObject({ kind: "countdown", label: "today" });
    expect(examDateState({ ...none, examDate: "2026-11-06" }, LATE)).toEqual({ kind: "ask_again", passed: "2026-11-06" });
    expect(examDateState({ examDate: null, examDateSkippedAt: "2026-11-01T00:00:00Z" }, NOON)).toEqual({ kind: "skipped" });
    expect(examDateState({ examDate: "2026-11-01", examDateSkippedAt: "2026-11-02T00:00:00Z" }, NOON)).toEqual({ kind: "skipped" });
  });

  it("a date can be saved from today up to two years ahead", () => {
    expect(examDateProblem("2026-11-06", NOON)).toBeNull();
    expect(examDateProblem("2026-11-05", NOON)).toBe("Choose today or a later date.");
    expect(examDateProblem("2030-01-01", NOON)).toBe("Choose a date within the next two years.");
    expect(examDateProblem("", NOON)).toBe("Choose a date.");
    expect(examDateProblem("2026-13-01", NOON)).toBe("Choose a date.");
  });
});
