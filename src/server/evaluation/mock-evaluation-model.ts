import "server-only";
import type { CefrLevel } from "@/domain/cefr";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import type { EvaluationResult, RetryFocusItem } from "@/domain/evaluation/schema";
import type { EvaluationInput, EvaluationModel, ModelEvaluationOutput } from "./types";

/**
 * Development-only evaluator. Produces a schema-valid result from simple
 * transcript heuristics so the whole loop can be tested without an API key.
 * It is NOT a real assessment: the UI labels results from this provider,
 * and it is refused in production by the provider factory.
 *
 * Even as a mock it must not invent progress: retry reviews are only
 * "achieved" when the objective can be checked from the transcript/metrics.
 */
export class MockEvaluationModel implements EvaluationModel {
  readonly provider = "mock";
  readonly model = "heuristic-dev-v2";
  readonly isDevelopmentProvider = true;
  readonly config = {};

  async evaluate(_prompt: unknown, input: EvaluationInput): Promise<ModelEvaluationOutput> {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return {
      output: buildHeuristicResult(input),
      provider: this.provider,
      model: this.model,
      inputTokens: null,
      outputTokens: null,
    };
  }
}

const PHRASE_OBJECTIVE = /^Use "(.+)" at most once$/;
const TIME_OBJECTIVE = "Speak for at least 100 seconds";

function buildHeuristicResult(input: EvaluationInput): EvaluationResult {
  const { metrics, transcript, previousAttempt, task } = input;
  // Quote the first sentence that has real words (not just "Uh...").
  const sentences = transcript.split(/(?<=[.!?])\s+/).filter((s) => evidenceTokens(s).length >= 3);
  const firstSentence = sentences[0] ?? transcript.slice(0, 120);

  const lengthScore = clamp(Math.round((metrics.timeUsedRatio ?? 0) * 6 + metrics.wordCount / 60), 1, 9);
  const varietyScore = clamp(Math.round((metrics.lexicalVariety ?? 0) * 12), 1, 9);
  const fluencyScore = clamp(lengthScore - Math.min(3, Math.floor(metrics.fillerCount / 3)), 1, 9);
  const grammarScore = clamp(Math.round((lengthScore + varietyScore) / 2), 1, 9);
  const overall = scoreToLevel(Math.round((lengthScore + varietyScore + fluencyScore + grammarScore) / 4));
  const repeated = metrics.repeatedPhrases[0];

  const criterion = (score: number, justification: string) => ({
    assessable: true,
    score,
    level: scoreToLevel(score),
    justification,
  });

  const issues: EvaluationResult["issues"] = [
    repeated
      ? {
          criterion: "vocabulary",
          severity: "high",
          evidence_basis: "transcript_quote",
          problem: `You repeat "${repeated.phrase}" ${repeated.count} times.`,
          evidence_quotes: [repeated.phrase],
          why_it_matters: "Repeating the same phrase makes your range look narrower than it is.",
          how_to_fix: `Prepare two alternatives to "${repeated.phrase}" before you speak and switch between them.`,
          improved_example: { original: firstSentence, improved: lightlyImprove(firstSentence) },
        }
      : {
          criterion: "task_achievement",
          severity: "medium",
          evidence_basis: "transcript_quote",
          problem: "Your first point is stated but not supported with an example from your life.",
          evidence_quotes: [firstSentence],
          why_it_matters: "B2 answers support opinions with reasons and specific examples.",
          how_to_fix: "After each opinion, add 'For example, ...' with something from your own life.",
          improved_example: {
            original: firstSentence,
            improved: `${firstSentence.replace(/[.!?]$/, "")}, for example when I message my classmates.`,
          },
        },
    {
      criterion: "task_achievement",
      severity: "medium",
      evidence_basis: "speech_metric",
      problem: `You spoke for ${metrics.speakingSeconds} of ${task.speakingSeconds} seconds.`,
      evidence_quotes: [],
      why_it_matters: "A short answer cannot show the range expected at B2.",
      how_to_fix: "Plan three parts: your opinion, one reason with an example, and a short conclusion.",
      improved_example: { original: "", improved: "In my view, ... For example, ... So overall, ..." },
    },
  ];

  const retryFocus: RetryFocusItem[] = [
    repeated
      ? {
          objective: `Use "${repeated.phrase}" at most once`,
          success_check: "Count how often you use it when you listen back.",
          criterion: "vocabulary",
          addresses_issue: 0,
        }
      : {
          objective: "Give one specific example from your own life",
          success_check: "Your answer includes 'For example, ...' with a real situation.",
          criterion: "task_achievement",
          addresses_issue: 0,
        },
    {
      objective: TIME_OBJECTIVE,
      success_check: "The recording timer passes 1:40 before you stop.",
      criterion: "task_achievement",
      addresses_issue: 1,
    },
  ];

  return {
    overall_level: overall,
    overall_summary: `Development evaluator: estimated ${overall} from ${metrics.wordCount} words in ${metrics.speakingSeconds}s.`,
    criteria: {
      fluency_coherence: criterion(fluencyScore, `${metrics.fillerCount} hesitation words; ${metrics.wordsPerMinute ?? "unknown"} words per minute.`),
      grammar: criterion(grammarScore, "Heuristic estimate based on length and variety (development only)."),
      vocabulary: criterion(varietyScore, `Lexical variety ratio ${metrics.lexicalVariety ?? "n/a"}.`),
      pronunciation: { assessable: false, score: null, level: null, justification: "Pronunciation cannot be assessed from a transcript." },
      task_achievement: criterion(lengthScore, `You used ${Math.round((metrics.timeUsedRatio ?? 0) * 100)}% of the speaking time.`),
    },
    task_coverage: task.prompts.map((prompt, index) => {
      const shared = keywordOverlap(prompt, transcript);
      return {
        prompt_index: index,
        status: shared >= 2 ? "covered" : shared === 1 ? "partly_covered" : "not_covered",
        note: `Development estimate: ${shared} key word(s) from this point appear in your answer.`,
      };
    }),
    strengths: [{ title: "You answered the question", detail: "Your answer stays on the topic of the task.", evidence_quote: firstSentence }],
    issues,
    retry_focus: retryFocus,
    retry_review: previousAttempt
      ? {
          objectives: previousAttempt.retryFocus.map((focus) => reviewObjective(focus.objective, input)),
          summary: "Development evaluator: only objectives that can be measured were checked.",
        }
      : null,
    reliability_note: "This result comes from the development evaluator, not a real assessment.",
  };
}

function reviewObjective(objective: string, input: EvaluationInput) {
  const phrase = PHRASE_OBJECTIVE.exec(objective)?.[1];
  if (phrase) {
    const count = countPhrase(input.transcript, phrase);
    return {
      objective,
      outcome: count <= 1 ? ("achieved" as const) : ("not_achieved" as const),
      evidence: `"${phrase}" appears ${count} time(s) in this answer.`,
    };
  }
  if (objective === TIME_OBJECTIVE) {
    const seconds = input.metrics.speakingSeconds;
    return {
      objective,
      outcome: seconds >= 100 ? ("achieved" as const) : seconds >= 70 ? ("partly_achieved" as const) : ("not_achieved" as const),
      evidence: `You spoke for ${seconds} seconds.`,
    };
  }
  return { objective, outcome: "not_achieved" as const, evidence: "The development evaluator cannot check this objective." };
}

function countPhrase(text: string, phrase: string): number {
  const haystack = evidenceTokens(text).join(" ");
  const needle = evidenceTokens(phrase).join(" ");
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function keywordOverlap(prompt: string, transcript: string): number {
  const words = new Set(evidenceTokens(transcript));
  return new Set(evidenceTokens(prompt).filter((w) => w.length > 4 && words.has(w))).size;
}

function lightlyImprove(sentence: string): string {
  const cleaned = sentence.replace(/\b(um+|uh+|er+),?\s*/gi, "").trim();
  const improved = cleaned.replace(/\bI think\b/i, "In my view,");
  return improved === cleaned ? `In my view, ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}` : improved;
}

function scoreToLevel(score: number): CefrLevel {
  const map: CefrLevel[] = ["A1", "A1", "A2", "A2+", "B1-", "B1", "B1+", "B2", "B2+", "C1", "C1"];
  return map[clamp(score, 0, 10)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
