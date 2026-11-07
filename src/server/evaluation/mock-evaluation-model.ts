import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { levelFromValue, type FeatureLevel, type QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { MOCK_QUESTION_KEYWORDS } from "./mock-question-keywords";
import type { EvaluationInput, EvaluationModel, ModelEvaluationOutput } from "./types";

/**
 * Development-only evaluator. Produces a schema-valid, gate-clean Multilevel judgement from simple transcript
 * heuristics so the whole loop can be tested without an API key. It is NOT a real assessment: the UI labels results
 * from this provider, and it is refused in production by the provider factory.
 *
 * Even as a mock it must not invent progress: retry reviews are only "achieved" when the objective can be checked
 * from the transcript.
 */
export class MockEvaluationModel implements EvaluationModel {
  readonly provider = "mock";
  readonly model = "heuristic-dev-v3";
  readonly isDevelopmentProvider = true;
  readonly config = {};

  /** `delayMs`: how long a "model call" takes (default 1.2 s, so the loop shows Scoring…; mock mode's demo uses 0). */
  constructor(private readonly options: { delayMs?: number } = {}) {}

  async evaluate(_prompt: unknown, input: EvaluationInput): Promise<ModelEvaluationOutput> {
    const delayMs = this.options.delayMs ?? 1200;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { output: buildHeuristicResult(input), provider: this.provider, model: this.model, inputTokens: null, outputTokens: null };
  }
}

/**
 * The "model answer" for a question the answer missed. A mock can't write a real answer on every task's topic, so it
 * says how to answer that very question; it never borrows another task's topic.
 */
function mockModelAnswer(questionId: number, prompt: string): string {
  return `Start with a direct answer to question ${questionId} ("${prompt}"), then give one reason and one example.`;
}

const LINKERS_B2 = ["however", "although", "on the other hand", "as a result", "whereas", "overall", "since"];

/** A sentence that talks about the picture itself. */
const PICTURE_WORDS = /\b(picture|photo|image)\b|\bi can see\b/i;

/** A question answered only in one sentence this short (in words) is "minimal": a bare answer that does not count. */
const MINIMAL_MAX_WORDS = 6;

function buildHeuristicResult(input: EvaluationInput): MultilevelModelOutput {
  const { metrics, transcript, previousAttempt, task } = input;
  const sentences = transcript.split(/(?<=[.!?])\s+/).filter((s) => evidenceTokens(s).length >= 3);
  const first = sentences[0] ?? transcript;
  const lower = transcript.toLowerCase();

  // A crude level from length and variety: enough to give different bands for the two mock transcripts.
  const lengthValue = metrics.wordCount >= 110 ? 2 : metrics.wordCount >= 50 ? 1 : 0;
  const varietyValue = (metrics.lexicalVariety ?? 0) >= 0.6 ? 2 : (metrics.lexicalVariety ?? 0) >= 0.4 ? 1 : 0;
  const linkers = LINKERS_B2.filter((l) => lower.includes(l));
  const base = levelFromValue(Math.round((lengthValue + varietyValue) / 2));
  const cohesion: FeatureLevel = linkers.length >= 2 ? "B2" : linkers.length === 1 ? "B1" : base === "B2" ? "B1" : base;
  const fluency: FeatureLevel = metrics.fillerCount >= 6 ? "B1" : base;
  const linkerSentence = sentences.find((s) => linkers.some((l) => s.toLowerCase().includes(l)));

  const feature = (level: FeatureLevel, evidence: string, note: string, how_to_improve: string, how_to_check: string) => ({
    level,
    evidence: evidence ? [evidence] : [],
    note,
    how_to_improve,
    how_to_check,
  });

  // Every sentence talks about the picture ("In the picture I can see…"): the answer describes it and answers no question.
  const pictureOnly = sentences.length > 0 && sentences.every((s) => PICTURE_WORDS.test(s));

  const questions = task.prompts.map((prompt, index) => {
    const keywords = questionKeywords(task, index);
    const hits = sentences.filter((s) => keywords.some((k) => evidenceTokens(s).includes(k)));
    const hit = hits[0];
    const shared = new Set(keywords.filter((k) => evidenceTokens(transcript).includes(k))).size;
    let status: QuestionStatus = shared >= 2 ? "on_topic" : shared === 1 ? "partial" : "missing";
    // Answered in one bare sentence and nowhere else: "minimal" (it does not count).
    if (status === "on_topic" && hits.length === 1 && evidenceTokens(hits[0]).length <= MINIMAL_MAX_WORDS) status = "minimal";
    if (pictureOnly) {
      return {
        id: index + 1,
        status: "off_topic" as const,
        evidence: sentences[0],
        note: "Development estimate: your answer describes the picture instead of answering this question.",
        model_answer: mockModelAnswer(index + 1, prompt),
      };
    }
    return {
      id: index + 1,
      status,
      evidence: status === "missing" ? "" : (hit ?? ""),
      note:
        status === "minimal"
          ? `Development estimate: question ${index + 1} is answered in one short sentence only.`
          : `Development estimate: ${shared} key word(s) from question ${index + 1} appear in your answer.`,
      model_answer: status === "on_topic" ? "" : mockModelAnswer(index + 1, prompt),
    };
  });

  return {
    questions,
    features: {
      grammar: feature(
        base,
        first,
        "Development estimate from the length of your answer.",
        // Examples on a topic of their own, never the task's (docs/feedback-review.md, issue 3).
        "Use one sentence with 'if' to say how things could have gone differently (e.g. 'If it had rained, we would have stayed at home').",
        "Your next answer has at least one sentence with 'if'.",
      ),
      vocabulary: feature(
        base,
        first,
        "Development estimate from how many different words you used.",
        "Use two phrases that fit your story, such as 'looking back' and 'as far as I remember'.",
        "You hear 'looking back' or 'as far as I remember' when you listen back.",
      ),
      fluency: feature(
        fluency,
        "",
        `Development estimate: ${metrics.fillerCount} hesitation sounds in ${metrics.speakingSeconds} seconds.`,
        "Plan the first sentence of each answer during preparation, so you start each question without 'um'.",
        "Each question starts without 'um' or 'uh'.",
      ),
      cohesion: feature(
        cohesion,
        linkerSentence ?? first,
        linkers.length ? `You link ideas with "${linkers[0]}".` : "Your ideas are linked mostly with 'and' and 'because'.",
        "Link two ideas with 'however' or 'on the other hand'.",
        "You use 'however' or 'on the other hand' at least once.",
      ),
      pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
    },
    memorized_or_irrelevant: false,
    errors: [],
    error_patterns: [],
    strengths: cohesion === "B2" && linkerSentence ? [{ feature: "cohesion", quote: linkerSentence, note: "You contrast ideas with a linking word." }] : [],
    retry_review: previousAttempt
      ? {
          objectives: previousAttempt.retryFocus.map((focus) => reviewObjective(focus.objective, input)),
          summary: "Development evaluator: only objectives that can be checked from the transcript were checked.",
        }
      : null,
  };
}

/**
 * The key words of question `index` (0-based): the task's mock-only list when it has one (mock-question-keywords.ts),
 * else the question's own words longer than 4 letters.
 */
function questionKeywords(task: EvaluationInput["task"], index: number): string[] {
  const listed = MOCK_QUESTION_KEYWORDS[task.id]?.[index];
  return listed ? [...listed] : evidenceTokens(task.prompts[index] ?? "").filter((w) => w.length > 4);
}

function reviewObjective(objective: string, input: EvaluationInput) {
  const question = /^Answer question (\d+)/.exec(objective);
  if (question) {
    const words = new Set(evidenceTokens(input.transcript));
    const shared = new Set(questionKeywords(input.task, Number(question[1]) - 1).filter((w) => words.has(w))).size;
    return {
      objective,
      outcome: shared >= 2 ? ("achieved" as const) : shared === 1 ? ("partly_achieved" as const) : ("not_achieved" as const),
      evidence: `${shared} key word(s) from question ${question[1]} appear in this answer.`,
    };
  }
  return { objective, outcome: "not_achieved" as const, evidence: "The development evaluator cannot check this objective." };
}
