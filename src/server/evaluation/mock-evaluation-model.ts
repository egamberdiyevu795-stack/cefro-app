import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { levelFromValue, type FeatureLevel, type QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
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

  async evaluate(_prompt: unknown, input: EvaluationInput): Promise<ModelEvaluationOutput> {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { output: buildHeuristicResult(input), provider: this.provider, model: this.model, inputTokens: null, outputTokens: null };
  }
}

const MOCK_MODEL_ANSWERS = [
  "My friends and I mostly use Telegram and video calls to stay in touch every day.",
  "Social media helps us share ideas, but it can also waste a lot of our time.",
  "I think schools should limit phones in lessons, because students concentrate better without them.",
];

const LINKERS_B2 = ["however", "although", "on the other hand", "as a result", "whereas", "overall", "since"];

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

  const questions = task.prompts.map((prompt, index) => {
    const keywords = evidenceTokens(prompt).filter((w) => w.length > 4);
    const hit = sentences.find((s) => keywords.some((k) => evidenceTokens(s).includes(k)));
    const shared = new Set(keywords.filter((k) => evidenceTokens(transcript).includes(k))).size;
    const status: QuestionStatus = shared >= 2 ? "on_topic" : shared === 1 ? "partial" : "missing";
    return {
      id: index + 1,
      status,
      evidence: status === "missing" ? "" : (hit ?? ""),
      note: `Development estimate: ${shared} key word(s) from question ${index + 1} appear in your answer.`,
      model_answer: status === "on_topic" ? "" : MOCK_MODEL_ANSWERS[index] ?? "",
    };
  });

  return {
    questions,
    features: {
      grammar: feature(
        base,
        first,
        "Development estimate from the length of your answer.",
        "Use one sentence with 'if' (e.g. 'If schools limit phones, students will focus more').",
        "Your next answer has at least one sentence with 'if'.",
      ),
      vocabulary: feature(
        base,
        first,
        "Development estimate from how many different words you used.",
        "Use two topic words such as 'screen time' and 'stay in touch'.",
        "You hear 'screen time' or 'stay in touch' when you listen back.",
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

function reviewObjective(objective: string, input: EvaluationInput) {
  const question = /^Answer question (\d+)/.exec(objective);
  if (question) {
    const prompt = input.task.prompts[Number(question[1]) - 1] ?? "";
    const words = new Set(evidenceTokens(input.transcript));
    const shared = new Set(evidenceTokens(prompt).filter((w) => w.length > 4 && words.has(w))).size;
    return {
      objective,
      outcome: shared >= 2 ? ("achieved" as const) : shared === 1 ? ("partly_achieved" as const) : ("not_achieved" as const),
      evidence: `${shared} key word(s) from question ${question[1]} appear in this answer.`,
    };
  }
  return { objective, outcome: "not_achieved" as const, evidence: "The development evaluator cannot check this objective." };
}
