import type { SpeakingTask } from "@/domain/speaking/task";
import { weightedPick } from "@/domain/speaking/weighted-pick";
import { PART11_BANK_VERSION, PART11_QUESTIONS, part11Question, spokenQuestionText, type Part11Question, type Part11Theme, type Part11Tier } from "./part1-1-bank";
import { PART1_QUESTION_AUDIO, part1AudioDir } from "./question-audio";

/**
 * Part 1.1 exam sets: three questions from the bank (part1-1-bank.ts), one per theme, in the order the list's note gives
 * (home/hometown → daily life/free time → personal preference), each picked at random weighted by its tier.
 *
 * A set is an ordinary SpeakingTask whose id names its questions (`a2-part1-1-set-04-06-08`), so attempts, results,
 * retries, history and the evaluator work unchanged: the id alone rebuilds the same task. A retry keeps the same set.
 */

/**
 * How much more often a tier is asked. Most common 6 : very common 3 : rare 1, inside each theme. Over the whole bank
 * that makes a most-common question about 6× as likely as a rare one (exact chances per question in docs/part1-question-bank.md).
 */
export const PART11_TIER_WEIGHTS: Record<Part11Tier, number> = { most_common: 6, very_common: 3, rare: 1 };

export const PART11_THEME_ORDER: readonly Part11Theme[] = ["home", "daily", "preference"];

const SET_PREFIX = "a2-part1-1-set-";
/** The Part 1.1 card on the task list: opening it picks a fresh set (practice page redirect). */
export const PART11_BANK_ENTRY_ID = "a2-part1-1-questions";
/** The set the task list's card shows and mock mode's fixed pages use: the first most-common question of each theme. */
export const PART11_DEFAULT_SET: readonly [number, number, number] = [1, 5, 8];
/** Where the bank's audio lives (one file per question, shared by every set, plus one introduction). */
export const PART11_BANK_AUDIO_DIR = part1AudioDir("a2-part1-1-bank", PART11_BANK_VERSION);

/** Spoken before Question 1 (our own wording), then the sample chime. Same words as the first Part 1.1 task. */
export const PART11_INTRO =
  "Part 1.1. In this part, you will hear three short questions about yourself and your daily life. After each question, you have five seconds to get ready, and then thirty seconds to answer. Start speaking when you hear this sound.";

export const part11QuestionAudio = (n: number) => `${PART11_BANK_AUDIO_DIR}/q${String(n).padStart(2, "0")}.wav`;
export const PART11_INTRO_AUDIO = `${PART11_BANK_AUDIO_DIR}/intro.wav`;

export function part11SetId(numbers: readonly number[]): string {
  return SET_PREFIX + numbers.map((n) => String(n).padStart(2, "0")).join("-");
}

/** A set is valid when it has one question per theme, in theme order, with no two on the same subject. */
export function isValidPart11Set(questions: readonly (Part11Question | undefined)[]): questions is readonly Part11Question[] {
  if (questions.length !== 3 || questions.some((q) => !q)) return false;
  const qs = questions as readonly Part11Question[];
  if (qs.some((q, i) => q.theme !== PART11_THEME_ORDER[i])) return false;
  const subjects = qs.flatMap((q) => (q.subject ? [q.subject] : []));
  return new Set(subjects).size === subjects.length;
}

/** The question numbers of a set id, or null when the id is not a valid set. */
export function parsePart11SetId(id: string): [number, number, number] | null {
  const m = /^a2-part1-1-set-(\d{2})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return null;
  const numbers = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  return isValidPart11Set(numbers.map(part11Question)) ? numbers : null;
}

export interface PickOptions {
  /** Questions to leave out when their theme has others (the student's last set), so two practices in a row differ. */
  avoid?: Iterable<number>;
}

/**
 * Three question numbers: one per theme, each weighted by tier (PART11_TIER_WEIGHTS). The preference question is never
 * on the same subject as an earlier one (food, sport). `random` returns 0 ≤ r < 1.
 */
export function pickPart11Questions(random: () => number = Math.random, options: PickOptions = {}): [number, number, number] {
  const avoid = new Set(options.avoid ?? []);
  const picked: Part11Question[] = [];
  for (const theme of PART11_THEME_ORDER) {
    const usedSubjects = new Set(picked.flatMap((q) => (q.subject ? [q.subject] : [])));
    const allowed = PART11_QUESTIONS.filter((q) => q.theme === theme && !(q.subject && usedSubjects.has(q.subject)));
    const fresh = allowed.filter((q) => !avoid.has(q.n));
    const pick = weightedPick(fresh.length > 0 ? fresh : allowed, (q) => PART11_TIER_WEIGHTS[q.tier], random);
    if (!pick) throw new Error(`Part 1.1 bank has no question for theme ${theme}`);
    picked.push(pick);
  }
  return picked.map((q) => q.n) as [number, number, number];
}

export function pickPart11SetId(random: () => number = Math.random, options: PickOptions = {}): string {
  return part11SetId(pickPart11Questions(random, options));
}

/** Is this id a Part 1.1 set or the task list's entry (the tasks the bank makes)? */
export function isPart11BankTaskId(id: string): boolean {
  return id === PART11_BANK_ENTRY_ID || parsePart11SetId(id) !== null;
}

/** The questions of a bank task id (the entry uses the default set). */
export function part11QuestionsOf(id: string): readonly Part11Question[] | null {
  const numbers = id === PART11_BANK_ENTRY_ID ? PART11_DEFAULT_SET : parsePart11SetId(id);
  return numbers ? numbers.map((n) => part11Question(n)!) : null;
}

const INSTRUCTIONS = [
  "You will hear three questions, one after another. Each question is also shown on screen.",
  "After each question you have 5 seconds to get ready. Then you hear a chime: start speaking. You have 30 seconds for each answer, and a chime tells you when the time is up.",
  "The next question starts automatically.",
  "Headphones are recommended.",
];

function buildTask(id: string, questions: readonly Part11Question[], entry: boolean): SpeakingTask {
  const prompts = questions.map((q) => q.text);
  const labels = questions.map((q) => q.label);
  return {
    id,
    version: PART11_BANK_VERSION,
    level: "A2",
    part: 1,
    taskType: "short_answers",
    rubricId: "multilevel-q1-3",
    // The task list's card says what the part is; a set says what it asked (History, results, the mock).
    title: entry ? "Questions about you" : [labels[0], ...labels.slice(1).map((l) => l.charAt(0).toLowerCase() + l.slice(1))].join(", "),
    topic: entry ? "Home, daily life and things you like (new questions each time)" : "Home, daily life and things you like",
    question: "Answer three short questions about yourself.",
    prompts,
    instructions: INSTRUCTIONS,
    preparationSeconds: 0,
    speakingSeconds: 90,
    delivery: {
      firstQuestionNumber: 1,
      intro: { text: PART11_INTRO, audio: PART11_INTRO_AUDIO },
      questions: questions.map((q) => ({ text: q.text, audio: part11QuestionAudio(q.n), prepSeconds: 5, speakingSeconds: 30 })),
      audioSource: PART1_QUESTION_AUDIO,
    },
    evaluatorGuidance: [
      ...questions.map((q, i) => `Question ${i + 1} is answered when the student ${q.answeredWhen}`),
      "Where a question offers two options with a slash (for example 'house / your home'), answering either one is enough.",
      "Single words or short phrases that answer the question count as on topic in Part 1.1 (for example 'A flat.' for 'Do you live in a house or a flat?').",
      "Typical vocabulary at A2: usually, sometimes, often, every day, favourite, like, because, big, small, near, tasty, friendly, together.",
    ].join("\n"),
  };
}

const cache = new Map<string, SpeakingTask>();

/** The task for a Part 1.1 set id or the bank entry; undefined for any other id. The same object for the same id. */
export function getPart11BankTask(id: string): SpeakingTask | undefined {
  const cached = cache.get(id);
  if (cached) return cached;
  const questions = part11QuestionsOf(id);
  if (!questions) return undefined;
  const task = buildTask(id, questions, id === PART11_BANK_ENTRY_ID);
  cache.set(id, task);
  return task;
}

/** Audio file → the words it speaks, for every bank question and the introduction (the manifest must match). */
export function part11BankAudioTexts(): { path: string; text: string }[] {
  return [{ path: PART11_INTRO_AUDIO, text: PART11_INTRO }, ...PART11_QUESTIONS.map((q) => ({ path: part11QuestionAudio(q.n), text: spokenQuestionText(q.text) }))];
}

/** Every valid set (for tests and the chance table in the docs). */
export function allPart11Sets(): [number, number, number][] {
  const by = (t: Part11Theme) => PART11_QUESTIONS.filter((q) => q.theme === t);
  const out: [number, number, number][] = [];
  for (const a of by("home")) for (const b of by("daily")) for (const c of by("preference")) if (isValidPart11Set([a, b, c])) out.push([a.n, b.n, c.n]);
  return out;
}
