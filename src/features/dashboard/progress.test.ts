import { describe, expect, it } from "vitest";
import { bestFitLevel, scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES, type FeatureLevel, type PronunciationLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { multilevelRubricConfigSchema } from "@/domain/evaluation/multilevel/rubric-config";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { listSpeakingTasks } from "@/content/speaking";
import rawQ7 from "@/server/evaluation/rubrics/multilevel_q7.json";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import {
  dashboardFix,
  formatMinutes,
  middleLevel,
  overallLevel,
  partTiles,
  practiseNext,
  progress,
  radarAxes,
  scoredAttempts,
  skillLevels,
  type TaskInfo,
} from "./progress";

const q7 = multilevelRubricConfigSchema.parse(rawQ7);
const TASK = "b2-part2-advice-from-someone";
const NOW = new Date("2026-11-06T09:00:00.000Z");
const TASKS: TaskInfo[] = [{ id: TASK, title: "Advice from someone", part: 2, level: "B2", preparationSeconds: 60, speakingSeconds: 120 }];

/** A saved live result (A2 run 1 = band 2, A3 = band 3, A4 = band 4), optionally with other skill levels. */
function result(anchor = "A2-b1-all-three", levels?: Partial<Record<(typeof FEATURES)[number], PronunciationLevel>>): MultilevelResult {
  const r = structuredClone(LIVE_36_FLASH_FIXTURES[anchor].runs[0].evaluation.result as MultilevelResult);
  for (const [feature, level] of Object.entries(levels ?? {})) r.assessment.features[feature as (typeof FEATURES)[number]].level = level as never;
  return r;
}

let n = 0;
function attempt(day: number, over: Partial<HistoryAttempt> = {}): HistoryAttempt {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    taskId: TASK,
    title: "Advice from someone",
    part: "2",
    createdAt: new Date(Date.UTC(2026, 10, 6) - day * 86_400_000).toISOString(), // day = days ago
    status: "completed",
    isStalled: false,
    failureCode: null,
    recordingDurationMs: 120_000,
    previousAttemptId: null,
    result: result(),
    ...over,
  };
}
/** Newest first, as the server returns them. */
const sorted = (list: HistoryAttempt[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const allAt = (level: FeatureLevel, pron: PronunciationLevel = "not_assessed") =>
  result("A2-b1-all-three", { grammar: level, vocabulary: level, fluency: level, cohesion: level, pronunciation: pron });

describe("level and skills: the middle of the last 3 scored answers", () => {
  it("middle value: of 3 the middle one; of 2 the mean rounded as the scorer rounds (.5 down); of 1 itself", () => {
    expect(middleLevel(["B2", "below_B1", "B1"])).toBe("B1");
    expect(middleLevel(["B1", "B2"])).toBe("B1");
    expect(middleLevel(["B1", "above_B2"])).toBe("B2");
    expect(middleLevel(["B2"])).toBe("B2");
    expect(middleLevel([])).toBeNull();
  });

  it("per skill, with not-assessed answers left out of that skill only", () => {
    const skills = skillLevels([
      result("A2-b1-all-three", { grammar: "B2", pronunciation: "not_assessed" }),
      result("A2-b1-all-three", { grammar: "B1", pronunciation: "B2" }),
      result("A2-b1-all-three", { grammar: "above_B2", pronunciation: "not_assessed" }),
    ]);
    expect(skills.grammar).toBe("B2");
    expect(skills.pronunciation).toBe("B2"); // from the one answer that assessed it
    expect(skillLevels([allAt("B1")]).pronunciation).toBeNull();
  });

  it("the overall level is computed exactly as the scorer computes an answer's language level", () => {
    const cases: Record<string, FeatureLevel>[] = [
      { grammar: "B1", vocabulary: "B2", fluency: "B2", cohesion: "B1" }, // 1.5 → B1
      { grammar: "B2", vocabulary: "B2", fluency: "B2", cohesion: "B1" }, // 1.75 → B2
      { grammar: "below_B1", vocabulary: "B1", fluency: "B1", cohesion: "B1" },
    ];
    for (const levels of cases) {
      const skills = { ...levels, pronunciation: null } as Parameters<typeof overallLevel>[0];
      const scored = scoreBand({ questions: [1, 2, 3].map((id) => ({ id, status: "on_topic" as const })), features: { ...levels, pronunciation: "not_assessed" } as never, memorizedOrIrrelevant: false }, q7);
      expect(overallLevel(skills)).toBe(scored.language_level);
      expect(overallLevel(skills)).toBe(bestFitLevel(Object.values(levels)).level);
    }
  });

  it("uses only the last 3 scored answers, and says how many", () => {
    const list = sorted([attempt(5, { result: allAt("below_B1") }), attempt(3, { result: allAt("B2") }), attempt(2, { result: allAt("B2") }), attempt(1, { result: allAt("B1") })]);
    const p = progress(list, { target: "B2", now: NOW })!;
    expect(p.levelLabel).toBe("B2");
    expect(p.basis).toBe("Based on your last 3 answers");
    expect(progress(list.slice(0, 2), { target: "B2", now: NOW })!.basis).toBe("Based on your last 2 answers");
    expect(progress(list.slice(0, 1), { target: "B2", now: NOW })!.basis).toBe("Based on your last answer");
  });

  it("skips answers that are not ratings: being scored, failed, too short, old method", () => {
    const tooShort = allAt("below_B1");
    tooShort.scoring = { ...tooShort.scoring, zero_reason: "too_short" };
    const list = sorted([
      attempt(0, { status: "evaluating", result: null }),
      attempt(1, { status: "failed", result: null }),
      attempt(2, { result: tooShort }),
      attempt(3, { result: null }),
      attempt(4, { result: allAt("B2") }),
    ]);
    expect(scoredAttempts(list)).toHaveLength(1);
    expect(progress(list, { target: "B2", now: NOW })!.basis).toBe("Based on your last answer");
  });

  it("nothing scored: no progress (the dashboard shows the first visit)", () => {
    expect(progress([], { target: "B2", now: NOW })).toBeNull();
    expect(progress([attempt(0, { status: "evaluating", result: null })], { target: "B2", now: NOW })).toBeNull();
  });
});

describe("x of 4 skills at B2", () => {
  it("counts assessed skills at or above the target; pronunciation not assessed is not counted", () => {
    const r = result("A2-b1-all-three", { grammar: "B1", vocabulary: "B2", fluency: "above_B2", cohesion: "B1", pronunciation: "not_assessed" });
    expect(progress([attempt(0, { result: r })], { target: "B2", now: NOW })!.goal).toEqual({ atTarget: 2, assessed: 4, label: "2 of 4 skills at B2" });
    const withPron = result("A2-b1-all-three", { grammar: "B2", vocabulary: "B2", fluency: "B2", cohesion: "B2", pronunciation: "B1" });
    expect(progress([attempt(0, { result: withPron })], { target: "B2", now: NOW })!.goal.label).toBe("4 of 5 skills at B2");
  });

  it("the radar shows a skill that was never assessed as not assessed", () => {
    const axes = radarAxes(skillLevels([allAt("B1")]));
    expect(axes.find((a) => a.label === "Pronunciation")?.value).toBeNull();
    expect(axes.find((a) => a.label === "Grammar")?.value).toBe(1);
  });
});

describe("Up from …", () => {
  const six = (earlier: FeatureLevel, latest: FeatureLevel) =>
    sorted([...[8, 7, 6].map((d) => attempt(d, { result: allAt(earlier) })), ...[3, 2, 1].map((d) => attempt(d, { result: allAt(latest) }))]);

  it("compares with the 3 scored answers before the last 3; shown only when the level went up", () => {
    expect(progress(six("B1", "B2"), { target: "B2", now: NOW })!.upFrom).toBe("B1");
    expect(progress(six("B2", "B2"), { target: "B2", now: NOW })!.upFrom).toBeNull();
    expect(progress(six("B2", "B1"), { target: "B2", now: NOW })!.upFrom).toBeNull();
  });

  it("hidden with fewer than 3 earlier scored answers", () => {
    expect(progress(six("B1", "B2").slice(0, 5), { target: "B2", now: NOW })!.upFrom).toBeNull();
  });
});

describe("practice stats", () => {
  it("attempts and speaking time this month (Uzbekistan's month), parts practised of 4", () => {
    const list = sorted([attempt(1), attempt(2), attempt(10, { createdAt: "2026-10-31T20:00:00.000Z" }), attempt(40, { part: "1.1" })]);
    // 31 Oct 20:00 UTC is 1 Nov 01:00 in Tashkent: this month.
    expect(progress(list, { target: "B2", now: NOW })!.stats).toEqual([
      { label: "Attempts this month", value: "3" },
      { label: "Parts practised", value: "2 of 4" },
      { label: "Practice time this month", value: "6 min" },
    ]);
    expect(formatMinutes(200)).toBe("3 h 20 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("biggest fix", () => {
  const ctx = { prompts: () => ["q1", "q2", "q3"], transcript: "My father gave me advice.", target: "B2" as FeatureLevel };

  it("comes from the latest scored answer, with its retry link", () => {
    const latest = attempt(0, { result: result("A3-b2-q3-missing") });
    const fix = dashboardFix(sorted([attempt(2), latest]), ctx)!;
    expect(fix.retryHref).toBe(`/practice/speaking/${TASK}?retry=${latest.id}`);
    expect(fix.fix.label).toMatch(/^Question 3/); // A3's biggest fix is its missed question 3
  });

  it("'Still in X of your last 4 answers': the same skill below the target", () => {
    const grammarFix = (grammar: FeatureLevel) => {
      const r = result("A2-b1-all-three", { grammar });
      r.scoring = { ...r.scoring, biggest_fix: { kind: "feature", feature: "grammar" } };
      return r;
    };
    const list = sorted([attempt(5, { result: grammarFix("B1") }), attempt(4, { result: grammarFix("B1") }), attempt(3, { result: grammarFix("B1") }), attempt(2, { result: grammarFix("B2") }), attempt(1, { result: grammarFix("B1") })]);
    expect(dashboardFix(list, ctx)!.stillIn).toEqual({ count: 3, of: 4 });
    // The latest answer already has grammar at the target: not "still", so the line is hidden.
    expect(dashboardFix(sorted([...list.slice(1), attempt(0, { result: grammarFix("B2") })]), ctx)!.stillIn).toBeNull();
    // One answer: nothing to compare with, the line is hidden.
    expect(dashboardFix(list.slice(0, 1), ctx)!.stillIn).toBeNull();
  });

  it("a question fix counts that question not answered, in the same task only", () => {
    const missed = result("A3-b2-q3-missing");
    const list = sorted([attempt(3, { result: result("A3-b2-q3-missing") }), attempt(2, { result: result("A4-b2-all-three") }), attempt(1, { taskId: "other", result: result("A3-b2-q3-missing") }), attempt(0, { result: missed })]);
    expect(dashboardFix(list, ctx)!.stillIn).toEqual({ count: 2, of: 4 });
  });

  it("nothing scored: no biggest fix", () => {
    expect(dashboardFix([attempt(0, { status: "failed", result: null })], ctx)).toBeNull();
  });
});

describe("practise next", () => {
  const withReview = (outcome: "achieved" | "partly_achieved" | "not_achieved") => {
    const r = result("A4-b2-all-three");
    r.assessment.retry_review = { objectives: [{ objective: "o", outcome, evidence: "e" }], summary: "s" };
    return r;
  };

  it("the latest retry's goal is Not yet: that retry again, with the same goal", () => {
    const original = attempt(3, { result: result("A3-b2-q3-missing") });
    const retry = attempt(1, { previousAttemptId: original.id, result: withReview("not_achieved") });
    const next = practiseNext(sorted([original, retry]), TASKS)!;
    expect(next.href).toBe(`/practice/speaking/${TASK}?retry=${original.id}`);
    expect(next.goal).toBe(original.result!.retry_focus[0].objective);
    expect(next.reason).toBe("Your goal isn't met yet");
    expect(practiseNext(sorted([original, attempt(1, { previousAttemptId: original.id, result: withReview("partly_achieved") })]), TASKS)!.goal).not.toBeNull();
  });

  it("an unfinished goal (the latest retry was not scored): that retry again", () => {
    const original = attempt(3);
    const failed = attempt(1, { previousAttemptId: original.id, status: "failed", result: null });
    const next = practiseNext(sorted([original, failed]), TASKS)!;
    expect(next).toMatchObject({ reason: "Finish your goal", href: `/practice/speaking/${TASK}?retry=${original.id}` });
    // Still being scored is not unfinished.
    const scoring = attempt(0, { previousAttemptId: original.id, status: "evaluating", result: null });
    expect(practiseNext(sorted([original, scoring]), TASKS)!.goal).toBeNull();
  });

  it("goal met, or no retry: the task practised least recently, never-practised first", () => {
    const original = attempt(3);
    const met = attempt(1, { previousAttemptId: original.id, result: withReview("achieved") });
    expect(practiseNext(sorted([original, met]), TASKS)).toMatchObject({ goal: null, reason: "Last practised 05.11.26", href: `/practice/speaking/${TASK}`, minutes: 3, partLabel: "Part 2" });
    const tasks: TaskInfo[] = [...TASKS, { id: "new-task", title: "A new task", part: 2, level: "B2", preparationSeconds: 60, speakingSeconds: 120 }];
    expect(practiseNext(sorted([original]), tasks)).toMatchObject({ title: "A new task", reason: "Not practised yet" });
    expect(practiseNext([], TASKS)).toMatchObject({ title: "Advice from someone", reason: "Not practised yet" });
  });
});

describe("exam part tiles", () => {
  it("the latest scored band per part; untried parts have no band (Start)", () => {
    const tiles = partTiles(sorted([attempt(3, { result: result("A4-b2-all-three") }), attempt(1, { result: result("A2-b1-all-three") }), attempt(0, { status: "evaluating", result: null })]), TASKS);
    expect(tiles.map((t) => [t.partLabel, t.band, t.bandLabel])).toEqual([
      ["Part 1.1", null, null],
      ["Part 1.2", null, null],
      ["Part 2", 2, "Higher B1"],
      ["Part 3", null, null],
    ]);
    expect(tiles[2].href).toBe("/#part-2"); // the Part 2 tasks on the task list, not one task
    expect(tiles[0].href).toBe("/"); // no Part 1.1 task yet: the task list
  });
});

describe("with the 7 real Part 2 tasks", () => {
  const ALL: TaskInfo[] = listSpeakingTasks().map(({ id, title, part, level, preparationSeconds, speakingSeconds }) => ({
    id, title, part, level, preparationSeconds, speakingSeconds,
  }));
  const on = (taskId: string, day: number) => attempt(day, { taskId, title: ALL.find((t) => t.id === taskId)!.title });

  it("Practise next goes through every task: never practised first (in list order), then the one practised least recently", () => {
    expect(ALL).toHaveLength(7);
    expect(practiseNext([], ALL)).toMatchObject({ title: "Advice from someone", reason: "Not practised yet", minutes: 3, partLabel: "Part 2" });
    expect(practiseNext([on(ALL[0].id, 1)], ALL)).toMatchObject({ title: "An important decision", reason: "Not practised yet", href: `/practice/speaking/${ALL[1].id}` });

    // Five tried (newest = index 0): the first never-practised one is next.
    const five = sorted(ALL.slice(0, 5).map((t, i) => on(t.id, 10 - i)));
    expect(practiseNext(five, ALL)).toMatchObject({ title: "A tradition", reason: "Not practised yet" });

    // All seven tried: the one practised longest ago, whatever its place in the list.
    const days = [3, 5, 1, 2, 9, 4, 6]; // "Trying and failing" (9 days ago) is the oldest
    const all = sorted(ALL.map((t, i) => on(t.id, days[i])));
    expect(practiseNext(all, ALL)).toMatchObject({ title: "Trying and failing", reason: "Last practised 28.10.26", href: `/practice/speaking/${ALL[4].id}` });
  });

  it("a retry goal still wins over the task rotation", () => {
    const original = on(ALL[3].id, 3);
    const retry = attempt(1, { taskId: ALL[3].id, title: ALL[3].title, previousAttemptId: original.id, status: "failed", result: null });
    expect(practiseNext(sorted([original, retry]), ALL)).toMatchObject({ title: "Working in a team", reason: "Finish your goal", href: `/practice/speaking/${ALL[3].id}?retry=${original.id}` });
  });

  it("the Part 2 tile shows the latest Part 2 band whichever task it came from, and opens the Part 2 task list", () => {
    const tiles = partTiles(sorted([on(ALL[0].id, 3), { ...on(ALL[6].id, 1), result: result("A4-b2-all-three") }]), ALL);
    expect(tiles[2]).toMatchObject({ partLabel: "Part 2", band: 4, href: "/#part-2" });
    expect(partTiles([], ALL).map((t) => t.href)).toEqual(["/", "/", "/#part-2", "/"]);
  });
});
