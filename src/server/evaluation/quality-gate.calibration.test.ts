import { describe, expect, it } from "vitest";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { makeEvaluation } from "../../../test/fixtures";
import { applyQualityGate, findPronunciationClaim } from "./quality-gate";

/**
 * Calibration cases taken verbatim from the first real Gemini runs
 * (gemini-3.8-flash, 14 synthetic B2 Part 2 samples; see
 * docs/AI_EVALUATION_QUALITY.md). Each case records whether the draft was
 * genuinely bad ("reject") or fine ("accept"), judged by reading the output.
 * They guard both directions: the gate must keep catching real drift and
 * must stop rejecting good corrections.
 */
type Case = {
  id: string;
  criterion: EvaluationResult["issues"][number]["criterion"];
  basis: EvaluationResult["issues"][number]["evidence_basis"];
  original: string;
  improved: string;
  expected: "accept" | "reject" | "drop_original";
  why: string;
};

const CASES: Case[] = [
  {
    id: "S02[0] invented example replaces the student's idea",
    criterion: "task_achievement",
    basis: "transcript_quote",
    original: "The main advantage of social media, in my view, is access: a student in a small town can join communities of people who share their interests.",
    improved: "The main advantage of social media is access; for example, a classmate of mine joined an online chess community that connects players from across the country.",
    expected: "reject",
    why: "the student's own idea was swapped for an invented one",
  },
  {
    id: "S02[1] faithful vocabulary paraphrase",
    criterion: "vocabulary",
    basis: "transcript_quote",
    original: "What I've noticed is that these platforms are excellent for maintaining relationships that already exist, yet they rarely help us build new ones.",
    improved: "I've noticed that while these apps are great for keeping in touch with old friends, they rarely help us form new relationships.",
    expected: "accept",
    why: "same meaning, better wording; word swaps are the fix",
  },
  {
    id: "S06[1] adds the missing 'because' clause",
    criterion: "task_achievement",
    basis: "task_requirement",
    original: "Schools should limit phones.",
    improved: "Schools should limit phones because students often get distracted by notifications during lessons.",
    expected: "accept",
    why: "this is exactly the fix; the student's sentence is kept intact",
  },
  {
    id: "S07[1] replaces a repeated noun phrase",
    criterion: "vocabulary",
    basis: "transcript_quote",
    original: "I think social media is also bad because social media takes time.",
    improved: "However, these platforms can be harmful because they waste valuable study time.",
    expected: "accept",
    why: "the issue is the repetition of 'social media'; the idea is preserved",
  },
  {
    id: "S07[2] changes the student's stance and elaborates",
    criterion: "task_achievement",
    basis: "transcript_quote",
    original: "I think schools should limit phones because I think phones are a problem in lessons.",
    improved: "Schools should ban smartphones during class because students get distracted by message notifications instead of listening to teachers.",
    expected: "reject",
    why: "'limit' became 'ban' and a new reason was invented",
  },
  {
    id: "S08[0] weakens the stance and drops a sentence",
    criterion: "task_achievement",
    basis: "transcript_quote",
    original: "Schools should consider limiting smartphones. There are arguments for and against this idea.",
    improved: "Schools should limit smartphones during lessons because they distract students from learning. For instance, my classmates often check messages instead of listening to the teacher.",
    expected: "reject",
    why: "'consider limiting' became 'limit' and the second sentence was replaced",
  },
  {
    id: "S10[0] off-topic: a model answer to the missing task point",
    criterion: "task_achievement",
    basis: "task_requirement",
    original: "I want to talk about my hobby. I like football very much.",
    improved: "In my opinion, smartphones help young people stay in touch, but spending too much time online can make them less sociable in real life.",
    expected: "drop_original",
    why: "the improved text answers the question the student skipped; showing 'you said football → better smartphones' would mislead",
  },
  {
    id: "S11[0] skipped task point",
    criterion: "task_achievement",
    basis: "task_requirement",
    original: "So I believe social media is useful, but only if you control how much time you spend on it.",
    improved: "Regarding schools, I believe they should ban phone use during classes to prevent distractions, but let students use them during breaks.",
    expected: "drop_original",
    why: "the original is an unrelated sentence",
  },
  {
    id: "S13[0] gives the missing benefit and drawback",
    criterion: "task_achievement",
    basis: "transcript_quote",
    original: "Social media is good and bad.",
    improved: "Social media is helpful because it allows friends to stay in touch, but it can also be harmful when it distracts students from studying.",
    expected: "accept",
    why: "plain B2 sentence that keeps the student's idea and adds the missing specifics",
  },
  {
    id: "Spec example: showy rewrite",
    criterion: "task_achievement",
    basis: "transcript_quote",
    original: "I visited Samarkand with my friend.",
    improved: "During my unforgettable journey across the breathtaking ancient city of Samarkand, I had the privilege of exploring its majestic monuments.",
    expected: "reject",
    why: "the example from the product brief of what NOT to do",
  },
];

function runGate(testCase: Case) {
  const evaluation = makeEvaluation();
  evaluation.issues[0] = {
    ...evaluation.issues[0],
    criterion: testCase.criterion,
    evidence_basis: testCase.basis,
    // Keep a verifiable quote so only the improved-example rules are under test.
    evidence_quotes: [testCase.original],
    problem: "The sentence is missing the detail the task asks for in this answer.",
    how_to_fix: "Add one specific reason, introduced with 'because', to this sentence.",
    improved_example: { original: testCase.original, improved: testCase.improved },
  };
  evaluation.retry_focus[0] = { ...evaluation.retry_focus[0], criterion: testCase.criterion, addresses_issue: 0 };
  // One issue only, and nothing else that quotes the transcript, so just the improved-example rules are tested.
  evaluation.issues = [evaluation.issues[0]];
  evaluation.strengths = [{ ...evaluation.strengths[0], evidence_quote: "" }];
  return applyQualityGate(evaluation, { transcript: testCase.original, taskPromptCount: 3, hasPreviousAttempt: false });
}

describe("quality gate calibration on real Gemini output", () => {
  it.each(CASES.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { result, report } = runGate(testCase);
    const codes = report.violations.map((v) => v.code);

    if (testCase.expected === "reject") {
      expect(report.passed, testCase.why).toBe(false);
      expect(codes.some((c) => c.startsWith("improved_example_"))).toBe(true);
    } else {
      expect(report.passed, testCase.why).toBe(true);
      expect(codes.some((c) => c.startsWith("improved_example_"))).toBe(false);
      expect(result.issues[0].improved_example.original === "").toBe(testCase.expected === "drop_original");
      if (testCase.expected === "drop_original") expect(codes).toContain("example_original_unrelated");
    }
  });

  it("still rejects an unrelated original when the student DID say it (not a missing-content issue)", () => {
    const { report } = runGate({
      ...CASES[4],
      basis: "transcript_quote",
      original: "I like football very much and I play every weekend with my friends.",
      improved: "Smartphones help young people stay in touch with their families abroad.",
      expected: "reject",
    });
    expect(report.passed).toBe(false);
  });

  it("names the offending sentence in pronunciation findings", () => {
    const text = "Say 'I agree' without 'am'. Pronounce the final -s clearly when you speak.";
    expect(findPronunciationClaim(text)).toBe("Pronounce the final -s clearly when you speak.");
    expect(findPronunciationClaim("Pronunciation cannot be assessed from a transcript.")).toBeNull();
  });
});
