import "server-only";
import { CEFR_LEVELS, type CefrLevel } from "@/domain/cefr";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import type { EvaluationInput, EvaluationModel, ModelEvaluationOutput } from "./types";

/**
 * Development-only evaluator. Produces a schema-valid result from simple
 * transcript heuristics so the whole loop can be tested without an API key.
 * It is NOT a real assessment: the UI labels results from this provider,
 * and it is refused in production by the provider factory.
 */
export class MockEvaluationModel implements EvaluationModel {
  readonly provider = "mock";
  readonly model = "heuristic-dev-v1";
  readonly isDevelopmentProvider = true;

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

function buildHeuristicResult(input: EvaluationInput): EvaluationResult {
  const { metrics, transcript, previousAttempt } = input;
  const sentences = transcript.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const firstSentence = sentences[0] ?? transcript.slice(0, 120);

  const lengthScore = clamp(Math.round((metrics.timeUsedRatio ?? 0) * 6 + metrics.wordCount / 60), 1, 9);
  const varietyScore = clamp(Math.round((metrics.lexicalVariety ?? 0) * 12), 1, 9);
  const fluencyScore = clamp(lengthScore - Math.min(3, Math.floor(metrics.fillerCount / 3)), 1, 9);
  const grammarScore = clamp(Math.round((lengthScore + varietyScore) / 2), 1, 9);
  const average = (lengthScore + varietyScore + fluencyScore + grammarScore) / 4;
  const overall = scoreToLevel(Math.round(average));

  const repeated = metrics.repeatedPhrases[0];

  const criterion = (score: number, justification: string) => ({
    assessable: true,
    score,
    level: scoreToLevel(score),
    justification,
  });

  return {
    overall_level: overall,
    overall_summary: `Development evaluator: estimated ${overall} from ${metrics.wordCount} words in ${metrics.speakingSeconds}s.`,
    criteria: {
      fluency_coherence: criterion(fluencyScore, `${metrics.fillerCount} hesitation words and ${metrics.wordsPerMinute ?? "?"} words per minute.`),
      grammar: criterion(grammarScore, "Heuristic estimate based on length and variety (development only)."),
      vocabulary: criterion(varietyScore, `Lexical variety ratio ${metrics.lexicalVariety ?? "n/a"}.`),
      pronunciation: {
        assessable: false,
        score: null,
        level: null,
        justification: "Pronunciation cannot be assessed from a transcript.",
      },
      task_achievement: criterion(lengthScore, `You used ${Math.round((metrics.timeUsedRatio ?? 0) * 100)}% of the speaking time.`),
    },
    strengths: [
      { title: "You answered the question", detail: "Your answer stays on the topic of the task.", evidence_quote: firstSentence },
    ],
    issues: [
      repeated
        ? {
            criterion: "vocabulary",
            severity: "high",
            problem: `You repeat "${repeated.phrase}" ${repeated.count} times.`,
            evidence_quotes: [repeated.phrase],
            why_it_matters: "Repeating the same phrase makes your range look narrower than it is.",
            how_to_fix: "Prepare two alternatives before you speak and switch between them.",
            improved_example: { original: firstSentence, improved: "In my view, technology has changed how young people build friendships." },
          }
        : {
            criterion: "task_achievement",
            severity: "medium",
            problem: "Some points are mentioned but not developed with an example.",
            evidence_quotes: [firstSentence],
            why_it_matters: "B2 answers support opinions with reasons and specific examples.",
            how_to_fix: "After each opinion, add 'For example, ...' with something from your own life.",
            improved_example: { original: firstSentence, improved: `${firstSentence.replace(/[.!?]$/, "")}, for example when I message my classmates about homework.` },
          },
    ],
    retry_focus: [
      {
        objective: repeated ? `Use "${repeated.phrase}" at most once` : "Give one specific personal example",
        success_check: repeated ? "Count how often you use it when you listen back." : "Your answer includes 'For example, ...' with a real situation.",
        criterion: repeated ? "vocabulary" : "task_achievement",
      },
      {
        objective: "Speak for at least 100 seconds",
        success_check: "The recording timer passes 1:40 before you stop.",
        criterion: "task_achievement",
      },
    ],
    retry_review: previousAttempt
      ? {
          objectives: previousAttempt.retryFocus.map((focus) => ({
            objective: focus.objective,
            outcome: "partly_achieved" as const,
            evidence: "The development evaluator cannot verify objectives.",
          })),
          summary: "Development evaluator: compare the scores above for an honest picture.",
        }
      : null,
    reliability_note: "This result comes from the development evaluator, not a real assessment.",
  };
}

function scoreToLevel(score: number): CefrLevel {
  const map: Record<number, CefrLevel> = { 0: "A1", 1: "A1", 2: "A2", 3: "A2+", 4: "B1-", 5: "B1", 6: "B1+", 7: "B2", 8: "B2+", 9: "C1", 10: "C1" };
  return map[clamp(score, 0, 10)] ?? CEFR_LEVELS[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
