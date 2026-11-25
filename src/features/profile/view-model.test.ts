import { describe, expect, it } from "vitest";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import { progress } from "@/features/dashboard/progress";
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

const OPTIONS = { target: "B2" as const, now: new Date(Date.UTC(2026, 10, 6, 12)) };

describe("current level on Account: the same level as Home, never invented", () => {
  it("no attempts: no level", () => {
    expect(currentLevel([], OPTIONS)).toEqual({ kind: "none" });
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
    expect(currentLevel(attempts, OPTIONS)).toEqual({ kind: "none" });
  });

  it("equals Home's Speaking progress: level, target and basis", () => {
    const attempts = [attempt(0, { status: "evaluating", result: null }), attempt(1, { result: result("A4-b2-all-three") }), attempt(3), attempt(5)];
    const home = progress(attempts, OPTIONS)!;
    expect(currentLevel(attempts, OPTIONS)).toEqual({ kind: "level", level: home.levelLabel, target: home.targetLabel, basis: home.basis });
    expect(home.basis).toBe("Based on your last 3 answers");
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
