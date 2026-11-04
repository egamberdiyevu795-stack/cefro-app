import rawQ7 from "@/server/evaluation/rubrics/multilevel_q7.json";
import { scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { deriveRetryFocus, type MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { multilevelRubricConfigSchema } from "@/domain/evaluation/multilevel/rubric-config";
import type { LegacyEvaluationResult } from "@/domain/evaluation/schema";

/** Transcript that matches the quotes used by makeEvaluation(). */
export const FIXTURE_TRANSCRIPT =
  "I think phones are good. I think they help us talk with friends every day. Last year I have went to Samarkand with my friend and we used maps. My friend said the maps were very useful for us.";

export const Q7_CONFIG = multilevelRubricConfigSchema.parse(rawQ7);
export const FIXTURE_QUESTIONS = [
  "How do you and people your age use technology to communicate?",
  "What are the main advantages and disadvantages of social media for young people?",
  "Should schools limit the use of smartphones? Why or why not?",
];

/** A schema-valid, quality-gate-clean Multilevel model output for FIXTURE_TRANSCRIPT. Override fields as needed. */
export function makeModelOutput(overrides: Partial<MultilevelModelOutput> = {}): MultilevelModelOutput {
  const feature = (level: "B1" | "B2", evidence: string[], note: string, how_to_improve: string, how_to_check: string) => ({
    level,
    evidence,
    note,
    how_to_improve,
    how_to_check,
  });
  return {
    questions: [
      { id: 1, status: "on_topic", evidence: "they help us talk with friends every day", note: "You say how you use phones with friends.", model_answer: "" },
      {
        id: 2,
        status: "partial",
        evidence: "I think phones are good",
        note: "You mention only that phones are good.",
        model_answer: "Social media helps us stay in touch, but it can also waste a lot of our time.",
      },
      {
        id: 3,
        status: "missing",
        evidence: "",
        note: "You did not talk about schools.",
        model_answer: "As for schools, I think they should limit phones in lessons, because students can concentrate better.",
      },
    ],
    features: {
      grammar: feature(
        "B1",
        ["I have went to Samarkand"],
        "Simple sentences are correct, but 'have went' is wrong.",
        "Use 'last year' with the past simple: 'Last year I went to Samarkand'.",
        "Every sentence with 'last year' uses a past form without 'have'.",
      ),
      vocabulary: feature(
        "B1",
        ["I think phones are good"],
        "You use general words like 'good' for most ideas.",
        "Replace 'good' with a precise word such as 'useful' or 'convenient'.",
        "You use 'good' at most once.",
      ),
      fluency: feature(
        "B2",
        [],
        "You keep going without long pauses.",
        "Start each question's answer with a full sentence you planned in the preparation time.",
        "Each question starts without 'um'.",
      ),
      cohesion: feature(
        "B1",
        ["and we used maps"],
        "You link ideas mostly with 'and'.",
        "Link two ideas with 'however' or 'on the other hand'.",
        "You use 'however' or 'on the other hand' at least once.",
      ),
      pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
    },
    memorized_or_irrelevant: false,
    errors: [{ quote: "I have went to Samarkand", correction: "I went to Samarkand", type: "grammar", pattern: "Present perfect with a finished time" }],
    error_patterns: [
      {
        name: "Present perfect with a finished time",
        type: "grammar",
        rule: "With 'last year' or 'yesterday' use the past simple: 'Last year I went'.",
        how_to_fix: "When you say a past time, use one past verb without 'have'.",
      },
    ],
    strengths: [{ feature: "fluency", quote: "they help us talk with friends every day", note: "A complete idea said in one go." }],
    retry_review: null,
    ...overrides,
  };
}

/** A stored Multilevel (schema 3) result built the same way the evaluator builds it. */
export function makeMultilevelResult(output: MultilevelModelOutput = makeModelOutput()): MultilevelResult {
  const scoring = scoreBand(
    {
      questions: output.questions,
      features: Object.fromEntries(FEATURES.map((f) => [f, output.features[f].level])) as Parameters<typeof scoreBand>[0]["features"],
      memorizedOrIrrelevant: output.memorized_or_irrelevant,
    },
    Q7_CONFIG,
  );
  return {
    kind: "multilevel",
    rubric_id: "multilevel-q7",
    part: 2,
    official_question: 7,
    assessment: output,
    feature_sources: { grammar: "transcript", vocabulary: "transcript", fluency: "transcript", cohesion: "transcript", pronunciation: "none" },
    audio: { status: "not_assessed", reason: "disabled", provider: null, model: null },
    scoring,
    retry_focus: deriveRetryFocus(output, scoring, FIXTURE_QUESTIONS),
  };
}

/** A schema-valid legacy (schema 2) analytic result, as stored before the band scale. */
export function makeLegacyEvaluation(overrides: Partial<LegacyEvaluationResult> = {}): LegacyEvaluationResult {
  const criterion = (score: number) => ({ assessable: true, score, level: "B1" as const, justification: "Grounded reason." });
  return {
    overall_level: "B1+",
    overall_summary: "Clear answer with limited development.",
    criteria: {
      fluency_coherence: criterion(6),
      grammar: criterion(5),
      vocabulary: criterion(6),
      pronunciation: { assessable: false, score: null, level: null, justification: "Not assessed from a transcript." },
      task_achievement: criterion(5),
    },
    task_coverage: [
      { prompt_index: 0, status: "covered", note: "You talk about using phones with friends." },
      { prompt_index: 1, status: "partly_covered", note: "You mention only advantages." },
      { prompt_index: 2, status: "not_covered", note: "You did not talk about schools." },
    ],
    strengths: [{ title: "Clear opinion", detail: "You state your view early.", evidence_quote: "I think phones are good" }],
    issues: [
      {
        criterion: "grammar",
        severity: "high",
        evidence_basis: "transcript_quote",
        problem: "After 'have' you used 'went' instead of the past participle 'gone'.",
        evidence_quotes: ["I have went to Samarkand"],
        why_it_matters: "Wrong verb forms with 'have' are noticeable and lower your grammar score.",
        how_to_fix: "When you use 'have' for experiences, use the third form: have gone, have seen, have visited.",
        improved_example: {
          original: "Last year I have went to Samarkand with my friend",
          improved: "Last year I went to Samarkand with my friend",
        },
      },
      {
        criterion: "vocabulary",
        severity: "medium",
        evidence_basis: "transcript_quote",
        problem: "You start two sentences with 'I think'.",
        evidence_quotes: ["I think phones are good", "I think they help us"],
        why_it_matters: "Repeating the same opener makes your range look narrow.",
        how_to_fix: "Use 'In my view' or 'I believe' for your second opinion.",
        improved_example: { original: "I think they help us talk with friends every day", improved: "I believe they help us talk with friends every day" },
      },
    ],
    retry_focus: [
      {
        objective: "Use 'have' + third form (have gone, have seen) when you talk about experiences",
        success_check: "Every 'have' in your answer is followed by a third-form verb.",
        criterion: "grammar",
        addresses_issue: 0,
      },
    ],
    retry_review: null,
    reliability_note: null,
    ...overrides,
  };
}

/** Minimal bytes with a valid WebM (EBML) header, for upload tests. */
export function fakeWebm(bytes = 64): Buffer {
  const data = Buffer.alloc(bytes, 1);
  data.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return data;
}
