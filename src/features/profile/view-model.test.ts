import { describe, expect, it } from "vitest";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import { attemptCountText, currentLevel, memberSinceText } from "./view-model";

/** A saved live result through the real evaluator types (A2 run 1 = band 2, A4 = band 4). */
const result = (anchor: string): MultilevelResult => structuredClone(LIVE_36_FLASH_FIXTURES[anchor].runs[0].evaluation.result as MultilevelResult);

let n = 0;
function attempt(daysAgo: number, over: Partial<HistoryAttempt> = {}): HistoryAttempt {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    taskId: "b2-part2-advice-from-someone",
    title: "Advice from someone",
    part: "2",
    createdAt: new Date(Date.UTC(2026, 10, 6, 9) - daysAgo * 86_400_000).toISOString(),
    status: "completed",
    isStalled: false,
    failureCode: null,
    recordingDurationMs: 120_000,
    previousAttemptId: null,
    result: result("A2-b1-all-three"),
    ...over,
  };
}

describe("current level on Profile: the latest scored Part 2 answer, never invented", () => {
  it("no attempts: no level", () => {
    expect(currentLevel([])).toEqual({ kind: "none" });
  });

  it("only unscored attempts (scoring, failed, stalled, too short, old method): no level", () => {
    const tooShort = result("A2-b1-all-three");
    tooShort.scoring.zero_reason = "too_short";
    const attempts = [
      attempt(1, { status: "evaluating", result: null }),
      attempt(2, { status: "failed", result: null, failureCode: "transcription_failed" as never }),
      attempt(3, { status: "processing", isStalled: true, result: null }),
      attempt(4, { result: tooShort }),
      attempt(5, { result: null }), // completed with the old method: no Multilevel result
    ];
    expect(currentLevel(attempts)).toEqual({ kind: "none" });
  });

  it("only other parts scored: no level (Part 2 only)", () => {
    expect(currentLevel([attempt(1, { part: "1.2" }), attempt(2, { part: "3" }), attempt(3, { part: null })])).toEqual({ kind: "none" });
  });

  it("the latest scored Part 2 answer's level, read as History reads it; later unscored and other-part answers are skipped", () => {
    const band4 = attempt(3, { result: result("A4-b2-all-three") });
    const attempts = [attempt(0, { status: "evaluating", result: null }), attempt(1, { part: "3", result: result("A2-b1-all-three") }), band4, attempt(5)];
    const level = currentLevel(attempts);
    const scoring = band4.result!.scoring;
    expect(level).toEqual({
      kind: "level",
      level: scoring.label.replace(/^(Lower|Higher)\s+/, ""),
      band: `Part 2 · Band ${scoring.band} · ${scoring.label}`,
      date: "03.11.26",
      attemptId: band4.id,
    });
  });

  it("picks by date, whatever order the list comes in", () => {
    const newer = attempt(1, { result: result("A4-b2-all-three") });
    const older = attempt(6, { result: result("A2-b1-all-three") });
    expect(currentLevel([older, newer])).toMatchObject({ attemptId: newer.id });
  });
});

describe("Profile text", () => {
  it("counts every attempt", () => {
    expect(attemptCountText(0)).toBe("No practice attempts yet");
    expect(attemptCountText(1)).toBe("1 practice attempt");
    expect(attemptCountText(6)).toBe("6 practice attempts");
  });

  it("member since: the day in Uzbekistan", () => {
    expect(memberSinceText("2026-10-07T20:30:00.000Z")).toBe("Member since 08.10.26"); // 01:30 on 8 October in Tashkent
  });
});
