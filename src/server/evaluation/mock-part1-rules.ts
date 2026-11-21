import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { levelFromValue, type FeatureLevel, type QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { questionNumber } from "@/domain/speaking/task";
import { part11MockKeywords } from "@/content/speaking/part1/part1-1-bank-mock";
import { mockSentenceFixes } from "./mock-sentence-fixes";
import type { EvaluationInput } from "./types";

/**
 * MOCK EVALUATOR ONLY: the development evaluator's rules for Part 1.1 and 1.2 (docs/part1-plan.md §2, "Question
 * status rules"), so mock mode can show every Part 1 state. Never read by real scoring: not by the prompt, the quality
 * gate, the band scoring or any real provider (a test checks that only `mock-evaluation-model.ts` imports this file).
 *
 * - A question counts when its key words appear (Part 1.1: one is enough, even a single-word answer; there is no
 *   partial or minimal). Part 1.2: two or more key words = on topic, one = partial; an answer of one bare sentence of
 *   at most 6 words is partial (it counts; the note asks for a reason).
 * - Part 1.2 Question 4 ("What can you see in these pictures?"): words from only one picture = partial, with the task's
 *   own hint ("talk about both pictures") in the note.
 * - Levels come from the rubric's own ladder: a rough level from length and word variety, scaled to the part's time.
 *   Part 1.1's lowest level means "no meaningful language", so any real answer is at least its second level.
 */

/** Key words per Part 1 task and question (1-based order), lower case, whole words. */
export const MOCK_PART1_KEYWORDS: Record<string, readonly (readonly string[])[]> = {
  "a2-part1-1-daily-life": [
    ["weekend", "saturday", "sunday", "usually", "sleep", "play", "football", "park", "visit", "watch", "games", "friends"],
    ["food", "favourite", "eat", "plov", "manti", "lagman", "pizza", "tasty", "delicious", "cook", "cooks", "makes"],
    ["family", "mother", "father", "brother", "sister", "grandmother", "grandfather", "parents", "mum", "dad", "cousin"],
  ],
  "b1-part1-2-shopping": [
    // Question 4's words are the pictures' own; questions 5 and 6 use the plural and reasons, so describing the
    // pictures does not answer them.
    ["picture", "pictures", "first", "second", "stall", "seller", "trolley", "shelves", "outside", "inside"],
    ["markets", "local", "fresh", "cheaper", "bargain", "farmers", "friendly", "talk"],
    ["supermarkets", "everything", "convenient", "parking", "card", "clean", "choice", "fixed", "air"],
  ],
  "b1-part1-2-indoor-outdoor-sports": [
    ["picture", "pictures", "first", "second", "running", "runs", "gym", "machines", "outside", "inside"],
    ["indoor", "weather", "rain", "winter", "equipment", "trainer", "safe", "year"],
    ["prefer", "outdoor", "indoor", "fresh", "nature", "better", "like", "because"],
  ],
  "b1-part1-2-plane-or-train": [
    ["picture", "pictures", "first", "second", "plane", "train", "window", "clouds", "hills", "seat"],
    ["plane", "fast", "faster", "time", "countries", "far", "distance", "quick"],
    ["train", "view", "cheaper", "space", "comfortable", "station", "afraid", "environment"],
  ],
  "b1-part1-2-healthy-or-fast-food": [
    ["picture", "pictures", "first", "second", "salad", "burger", "burgers", "chips", "friends", "home"],
    ["healthy", "health", "energy", "weight", "vitamins", "sport", "doctor", "longer"],
    ["fast", "quick", "cheap", "tasty", "time", "cook", "busy", "friends"],
  ],
  "b1-part1-2-online-or-classroom": [
    ["picture", "pictures", "first", "second", "classroom", "tablet", "tablets", "laptop", "home", "students"],
    ["online", "home", "travel", "time", "flexible", "cheaper", "again", "anywhere"],
    ["classroom", "teacher", "classmates", "friends", "ask", "concentrate", "discipline", "practice"],
  ],
  "b1-part1-2-board-games-or-tv": [
    ["picture", "pictures", "first", "second", "sofa", "family", "dice", "board", "table", "friends"],
    ["board", "games", "talk", "together", "think", "fun", "screen", "communicate"],
    ["tv", "relax", "news", "films", "information", "easy", "alone", "programmes"],
  ],
};

/** Words of each picture of Part 1.2's Question 4, per task. A task with no entry skips the both-pictures check. */
const PICTURE_WORDS: Record<string, readonly (readonly string[])[]> = {
  "b1-part1-2-shopping": [
    ["market", "stall", "seller", "outside", "fruit", "vegetables", "bag", "street"],
    ["supermarket", "shelves", "trolley", "inside", "packets", "bottles", "checkout", "aisle"],
  ],
  "b1-part1-2-indoor-outdoor-sports": [
    ["running", "runs", "path", "hills", "trees", "outside", "countryside", "sunny"],
    ["gym", "machines", "machine", "towel", "bottle", "inside", "treadmill", "treadmills"],
  ],
  "b1-part1-2-plane-or-train": [
    ["plane", "clouds", "wing", "sky", "flying", "airplane"],
    ["train", "hills", "river", "table", "tea", "fields"],
  ],
  "b1-part1-2-healthy-or-fast-food": [
    ["salad", "kitchen", "water", "vegetables", "alone", "bowl"],
    ["burger", "burgers", "chips", "cafe", "friends", "drinks"],
  ],
  "b1-part1-2-online-or-classroom": [
    ["classroom", "tablet", "tablets", "board", "desks", "students", "school"],
    ["laptop", "home", "alone", "room", "lamp", "headphones"],
  ],
  "b1-part1-2-board-games-or-tv": [
    ["tv", "television", "sofa", "family", "watching", "watch"],
    ["board", "game", "dice", "table", "playing", "friends"],
  ],
};

export const MOCK_PART1_BARE_MAX_WORDS = 6;

export function mockPart1Output(input: EvaluationInput): MultilevelModelOutput {
  const { task, transcript, metrics, previousAttempt, rubric } = input;
  const config = rubric.config;
  const ladder = config.levels;
  const isPictures = task.taskType === "picture_questions";
  const statuses = config.question_statuses;
  const sentences = transcript.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => evidenceTokens(s).length >= 1);
  const words = new Set(evidenceTokens(transcript));
  const keywordLists = MOCK_PART1_KEYWORDS[task.id] ?? part11MockKeywords(task.id) ?? task.prompts.map((p) => evidenceTokens(p).filter((w) => w.length > 4));

  // A rough level from length and variety, scaled to the part's own speaking time (Part 2's thresholds are for 120 s).
  const scale = task.speakingSeconds / 120;
  const lengthValue = metrics.wordCount >= 110 * scale ? 2 : metrics.wordCount >= 50 * scale ? 1 : 0;
  const varietyValue = (metrics.lexicalVariety ?? 0) >= 0.6 ? 2 : (metrics.lexicalVariety ?? 0) >= 0.4 ? 1 : 0;
  let baseValue = Math.round((lengthValue + varietyValue) / 2);
  // Part 1.1: weak but meaningful language is never "no meaningful language".
  if (!isPictures && metrics.wordCount >= 1) baseValue = Math.max(1, baseValue);
  const base = levelFromValue(baseValue, ladder);
  const fluency: FeatureLevel = metrics.fillerCount >= 6 ? levelFromValue(Math.max(baseValue - 1, isPictures ? 0 : 1), ladder) : base;

  const questions = task.prompts.map((prompt, index) => {
    const id = index + 1;
    const shown = questionNumber(task, index);
    const keywords = keywordLists[index] ?? [];
    const hits = sentences.filter((s) => keywords.some((k) => evidenceTokens(s).includes(k)));
    const shared = new Set(keywords.filter((k) => words.has(k))).size;
    let status: QuestionStatus;
    let note: string;
    if (!isPictures) {
      status = shared >= 1 ? "on_topic" : "missing";
      note = status === "on_topic" ? `Development estimate: you answered question ${shown}.` : `Development estimate: nothing in your answer is about question ${shown}.`;
    } else {
      status = shared >= 2 ? "on_topic" : shared === 1 ? "partial" : "missing";
      note = `Development estimate: ${shared} key word(s) from question ${shown} appear in your answer.`;
      const bare = hits.length === 1 && evidenceTokens(hits[0]).length <= MOCK_PART1_BARE_MAX_WORDS;
      if (status === "on_topic" && bare) {
        status = "partial";
        note = `Development estimate: question ${shown} is answered in one short sentence. Add a reason or a detail.`;
      }
      const hint = task.delivery?.questions[index]?.partialHint;
      if (index === 0 && status !== "missing") {
        // "What can you see in these pictures?" (the exam's wording): both pictures needed; comparing is welcome, not required.
        const both = (PICTURE_WORDS[task.id] ?? []).every((list) => list.some((w) => words.has(w)));
        if (!both) {
          status = "partial";
          note = `Development estimate: you describe only one picture. Next time, ${hint ?? "talk about both pictures"}.`;
        }
      }
    }
    if (!statuses.includes(status)) status = "missing";
    return {
      id,
      status,
      evidence: status === "missing" ? "" : (hits[0] ?? ""),
      note,
      model_answer: status === "on_topic" ? "" : `Start with a direct answer to question ${shown} ("${prompt}"), then add one reason or detail.`,
    };
  });

  const first = sentences[0] ?? transcript;
  const feature = (level: FeatureLevel, evidence: string, note: string, how_to_improve: string, how_to_check: string) => ({
    level,
    evidence: evidence ? [evidence] : [],
    note,
    how_to_improve,
    how_to_check,
  });
  const linker = sentences.find((s) => /\b(because|but|so|and then|also)\b/i.test(s));

  const features: MultilevelModelOutput["features"] = {
    grammar: feature(
      base,
      first,
      "Development estimate from the length of your answers.",
      // Examples on a topic of their own, never the task's (docs/feedback-review.md, issue 3).
      "Use the past simple for one thing you did, e.g. 'Last summer I visited my uncle'.",
      "One of your answers has a verb in the past simple.",
    ),
    vocabulary: feature(
      base,
      first,
      "Development estimate from how many different words you used.",
      "Add one describing word to each answer, e.g. 'a quiet street', 'a long trip'.",
      "Each answer has at least one describing word.",
    ),
    fluency: feature(
      fluency,
      "",
      `Development estimate: ${metrics.fillerCount} hesitation sounds in ${metrics.speakingSeconds} seconds.`,
      "Start each answer at the chime with the words of the question, e.g. 'At the weekend I…'.",
      "Each answer starts without 'um' or 'uh'.",
    ),
    pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
  };
  if (config.features.includes("cohesion")) {
    features.cohesion = feature(
      linker ? levelFromValue(Math.max(baseValue, 1), ladder) : levelFromValue(Math.min(baseValue, 1), ladder),
      linker ?? first,
      linker ? "You join some ideas with simple linking words." : "Your answers are short lists of points.",
      "Join two ideas with 'because' or 'but', e.g. 'I like trains because they are fast'.",
      "Each answer has 'because' or 'but' at least once.",
    );
  }

  return {
    questions,
    features,
    memorized_or_irrelevant: false,
    errors: [],
    error_patterns: [],
    sentence_fixes: mockSentenceFixes(input.transcript),
    strengths: [],
    retry_review: previousAttempt
      ? {
          objectives: previousAttempt.retryFocus.map((focus) => reviewPart1Objective(focus.objective, input, questions)),
          summary: "Development evaluator: only objectives that can be checked from the transcript were checked.",
        }
      : null,
  };
}

function reviewPart1Objective(objective: string, input: EvaluationInput, questions: MultilevelModelOutput["questions"]) {
  const match = /^Answer question (\d+)/.exec(objective);
  if (match) {
    const id = Number(match[1]) - (input.task.delivery?.firstQuestionNumber ?? 1) + 1;
    const status = questions.find((q) => q.id === id)?.status;
    return {
      objective,
      outcome: status === "on_topic" ? ("achieved" as const) : status === "partial" ? ("partly_achieved" as const) : ("not_achieved" as const),
      evidence: `Question ${match[1]} is ${status === "on_topic" ? "answered" : status === "partial" ? "partly answered" : "not answered"} in this attempt.`,
    };
  }
  return { objective, outcome: "not_achieved" as const, evidence: "The development evaluator cannot check this objective." };
}
