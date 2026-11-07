import { describe, expect, it } from "vitest";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { HistoryAttempt } from "@/domain/speaking/history";
import {
  JOIN_CODE_ALPHABET,
  isJoinCode,
  makeJoinCode,
  normaliseJoinCode,
  ratingPair,
  shownNameProblem,
  suggestedShownName,
} from "@/domain/teacher/rules";
import { appVerdictText, bandOptionLabel, commonProblems, countText, ratingText, retryGoalOf, studentRow, type SharedStudent } from "./view-model";

/* A minimal Multilevel result: only the parts the teacher's view reads (biggest fix, question statuses, levels). */
function result(fix: MultilevelResult["scoring"]["biggest_fix"], opts: { q3?: string; level?: string; band?: number } = {}): MultilevelResult {
  const level = opts.level ?? "B1";
  const feature = { level, evidence: [], note: "", how_to_improve: "", how_to_check: "" };
  return {
    part: 2,
    scoring: { band: opts.band ?? 2, band_max: 5, label: "Higher B1", target_band: 3, zero_reason: null, biggest_fix: fix, on_topic_count: 2, provisional: true },
    assessment: {
      features: { grammar: feature, vocabulary: feature, fluency: feature, cohesion: feature, pronunciation: { ...feature, level: "not_assessed" } },
      questions: [1, 2, 3].map((id) => ({ id, status: id === 3 ? (opts.q3 ?? "on_topic") : "on_topic", evidence: "", note: "", model_answer: "" })),
      errors: [],
      error_patterns: [],
      strengths: [],
      memorized_or_irrelevant: false,
      retry_review: null,
    },
    retry_focus: [{ objective: "Answer question 3", success_check: "", target: { kind: "question", question_id: 3 } }],
  } as unknown as MultilevelResult;
}

let n = 0;
function attempt(r: MultilevelResult | null, opts: Partial<HistoryAttempt> = {}): HistoryAttempt {
  return {
    id: `a${++n}`,
    taskId: "b2-part2-a-tradition",
    title: "A tradition",
    part: "2",
    createdAt: "2026-11-05T10:00:00.000Z",
    status: r ? "completed" : "failed",
    isStalled: false,
    failureCode: r ? null : "transcription_empty",
    recordingDurationMs: 60_000,
    previousAttemptId: null,
    result: r,
    ...opts,
  };
}
const student = (name: string, attempts: HistoryAttempt[]): SharedStudent => ({ memberId: name, shownName: name, sharedAt: "2026-11-01T00:00:00.000Z", attempts });

const Q3 = { kind: "question_coverage", question_id: 3 } as const;
const GRAMMAR = { kind: "feature", feature: "grammar" } as const;

describe("join codes", () => {
  it("6 characters from the readable alphabet (no 0, O, 1, I, L)", () => {
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 200; i++) {
      const code = makeJoinCode(Math.random);
      expect(code).toHaveLength(6);
      expect(isJoinCode(code)).toBe(true);
    }
    expect(makeJoinCode(() => 0)).toBe("222222");
    expect(makeJoinCode(() => 0.9999)).toBe("ZZZZZZ");
  });

  it("not case-sensitive; spaces and dashes are ignored; anything else is not a code", () => {
    expect(normaliseJoinCode(" k7m-4qd ")).toBe("K7M4QD");
    expect(isJoinCode(normaliseJoinCode("k7m4qd"))).toBe(true);
    for (const bad of ["K7M4Q", "K7M4QDX", "DEMO42", "K7M4Q0", "", "K7M 4Q!"]) expect(isJoinCode(normaliseJoinCode(bad)), bad).toBe(false);
    expect(normaliseJoinCode(42)).toBe("");
  });
});

describe("the name a teacher sees", () => {
  it("prefilled with the first word of the account name, never an email", () => {
    expect(suggestedShownName("Alice Karimova")).toBe("Alice");
    expect(suggestedShownName("  Bob  ")).toBe("Bob");
    expect(suggestedShownName(null)).toBe("");
    expect(suggestedShownName("bob@example.com")).toBe("");
  });

  it("required, at most 30 characters, no email address", () => {
    expect(shownNameProblem("Ali")).toBeNull();
    expect(shownNameProblem("")).toBe("Enter the name your teacher sees.");
    expect(shownNameProblem("a@b.c")).toBe("Use a name, not an email address.");
    expect(shownNameProblem("x".repeat(31))).toMatch(/30/);
  });
});

describe("anonymous pairs", () => {
  it("only the two bands, the methodology, the part and the month; Agree keeps the app's band", () => {
    const base = { teacherBand: null, appBand: 3, evaluatorVersion: "e", rubricVersion: "r", createdAt: "2026-11-07T12:34:56.000Z" };
    expect(ratingPair({ ...base, agrees: true }, "2")).toEqual({ teacherBand: 3, appBand: 3, evaluatorVersion: "e", rubricVersion: "r", part: "2", month: "2026-11" });
    expect(ratingPair({ ...base, agrees: false, teacherBand: 4 }, "2").teacherBand).toBe(4);
  });
});

describe("most common problems", () => {
  it("top 3 biggest fixes, once per student from their latest shared scored attempt, with counts", () => {
    const students = [
      // The latest scored attempt counts, not earlier ones; a failed latest attempt is skipped.
      student("A", [attempt(null), attempt(result(Q3, { q3: "missing" })), attempt(result(GRAMMAR))]),
      student("B", [attempt(result(Q3, { q3: "missing" }))]),
      student("C", [attempt(result(GRAMMAR))]),
      student("D", [attempt(result({ kind: "feature", feature: "cohesion" }))]),
      student("E", [attempt(result({ kind: "own_words" }))]),
      student("F", []), // nothing scored: not counted
    ];
    const problems = commonProblems(students);
    expect(problems.map((p) => [p.label, p.count, p.of])).toEqual([
      ["Question 3 · Not answered", 2, 5],
      ["Grammar", 1, 5],
      ["Cohesion", 1, 5],
    ]);
    expect(countText(problems[0])).toBe("2 of 5 students");
    expect(countText({ count: 1, of: 1 })).toBe("1 of 1 student");
  });

  it("links only an approved lesson: a missing question has L-T1; a skill fix has none", () => {
    const [missing, grammar] = commonProblems([student("A", [attempt(result(Q3, { q3: "missing" }))]), student("B", [attempt(result(GRAMMAR))])]);
    expect(missing.lesson?.slug).toBe("l-t1");
    expect(grammar.lesson).toBeNull();
  });
});

describe("student rows", () => {
  it("level, attempts, last practice, biggest fix, retry goal; — with nothing shared", () => {
    expect(studentRow(student("F", []))).toEqual({ memberId: "F", name: "F", level: "No level yet", attempts: 0, lastPractice: "—", biggestFix: "—", retryGoal: "—" });
    const first = attempt(result(Q3, { q3: "missing" }), { createdAt: "2026-11-03T10:00:00.000Z" });
    const retry = attempt(result(GRAMMAR, { band: 3 }), { previousAttemptId: first.id, createdAt: "2026-11-04T10:00:00.000Z" });
    const row = studentRow(student("A", [retry, first]));
    expect(row).toMatchObject({ level: "B1", attempts: 2, lastPractice: "04.11.26", biggestFix: "Grammar", retryGoal: "Goal met" });
  });

  it("a retry whose original was before sharing (no previous) shows —", () => {
    expect(retryGoalOf([attempt(result(GRAMMAR), { previousAttemptId: null })])).toBe("—");
  });
});

describe("band labels", () => {
  const bands = [
    { band: 3, label: "Lower B2" },
    { band: 4, label: "Higher B2" },
  ];
  it("with the part's own labels", () => {
    expect(bandOptionLabel(bands[1])).toBe("Band 4 · Higher B2");
    expect(appVerdictText(2, 3, "Lower B2")).toBe("CEFRO: Part 2 · Band 3 · Lower B2");
    expect(ratingText({ agrees: true }, bands)).toBe("You: Agree");
    expect(ratingText({ agrees: false, band: 4 }, bands)).toBe("You: Higher B2 (Band 4)");
  });
});
