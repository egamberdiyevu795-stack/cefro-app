import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { POINT_IDS, type PointId } from "@/domain/speaking/argument-task";
import type { PointStatus } from "@/domain/evaluation/q8/model-output";
import { getArgumentTask } from "@/content/speaking/part3";

/**
 * Mock-only rules for the Part 3 development evaluator (`mock-argument-model.ts`, which is the only importer). Real
 * scoring never reads this file: the real evaluator is a model judging against the official descriptors.
 *
 * A listed point is "mentioned" by a sentence that contains one of its mock key phrases (each sentence goes to the
 * point with the most hits; ties to the earlier point). It is:
 *  - rebutted (and so only restated) when that sentence presents it as someone else's view and argues back
 *    ("Some people say …, but …"), the rebuttal rule of docs/part3-plan.md, decision 8;
 *  - developed when that sentence, or the next one if it mentions no other point, gives a reason or an example;
 *  - restated otherwise.
 */

/** Mock key phrases per task and point. Matched on whole words, case and punctuation ignored. */
export const MOCK_POINT_KEYWORDS: Record<string, Record<PointId, readonly string[]>> = {
  "c1-part3-cars-in-city-centres": {
    F1: ["cleaner air", "clean air", "less noise", "pollution", "exhaust", "quieter", "breathe", "breathing", "fumes"],
    F2: ["safer", "safety", "accidents", "pedestrians", "cyclists", "cross busy roads"],
    F3: ["use public transport", "take the bus", "switch to the metro", "get used to it", "leave their cars"],
    A1: ["elderly", "disabled", "grandmother", "grandfather", "walking stick", "can't walk", "cannot walk"],
    A2: ["shops", "businesses", "customers", "trade", "shopping"],
    A3: ["not good enough", "crowded", "overcrowded", "unreliable", "reliable enough", "irregular"],
  },
  "c1-part3-smartphones-under-14": {
    F1: ["screen time", "sleep", "staying up", "stay up", "tired", "screens"],
    F2: ["harmful content", "violent", "strangers", "scams", "inappropriate", "bullying", "adult content"],
    F3: ["face to face", "play outside", "in person", "real friends", "talk to each other"],
    A1: ["emergency", "reach them", "call home", "get lost", "got lost", "contact their parents"],
    A2: ["homework", "learning", "dictionary", "online lessons", "educational", "research"],
    A3: ["left out", "excluded", "group chat", "feel different", "teased", "only one without"],
  },
  "c1-part3-sugar-tax": {
    F1: ["overweight", "diabetes", "obesity", "ill", "teeth", "healthier habits"],
    F2: ["health services", "hospitals", "doctors", "clinics", "health care", "healthcare"],
    F3: ["healthier products", "recipes", "less sugar", "manufacturers", "new products", "companies would"],
    A1: ["low incomes", "low income", "poor families", "poorer families", "unfair", "budget"],
    A2: ["adults should decide", "decide what they eat", "freedom", "personal choice", "own choices"],
    A3: ["exercise", "sport", "sitting", "inactive", "gym"],
  },
};

const REASON = /\b(because|since|for example|for instance|which means|as a result|that is why|that's why|this means|otherwise|due to|thanks to|if|unless|so that)\b/i;
const REBUTTAL = /^(?:\W*)(?:some people (?:say|think|claim|argue)|others (?:say|claim|argue)|it is (?:often )?said|people often say|critics say)\b.*\b(?:but|yet|however)\b/i;

/** Sentences as exact substrings of the transcript (so they can be quoted strictly). */
export function mockSentences(transcript: string): string[] {
  return (transcript.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter((s) => evidenceTokens(s).length >= 3);
}

function hits(sentence: string, phrases: readonly string[]): number {
  const text = ` ${evidenceTokens(sentence).join(" ")} `;
  return phrases.filter((phrase) => text.includes(` ${evidenceTokens(phrase).join(" ")} `)).length;
}

export interface MockPointJudgement {
  id: PointId;
  status: PointStatus;
  rebutted: boolean;
  evidence: string;
  development_evidence: string;
}

/** Topics without listed key phrases (the Part 3 bank): each point's own text is its key phrase. */
function pointTextKeywords(taskId: string): Record<PointId, readonly string[]> | undefined {
  const task = getArgumentTask(taskId);
  return task ? (Object.fromEntries(task.points.map((p) => [p.id, [p.text]])) as unknown as Record<PointId, readonly string[]>) : undefined;
}

/** The mock judgement of each listed point, F1–A3 in order. Unknown task: every point not addressed. */
export function mockJudgePoints(taskId: string, transcript: string): MockPointJudgement[] {
  const keywords = MOCK_POINT_KEYWORDS[taskId] ?? pointTextKeywords(taskId);
  const sentences = mockSentences(transcript);
  // Each sentence goes to the point with the most key-phrase hits (ties: the earlier point), or to none.
  const owner = sentences.map((sentence) => {
    if (!keywords) return null;
    let best: PointId | null = null;
    let most = 0;
    for (const id of POINT_IDS) {
      const n = hits(sentence, keywords[id]);
      if (n > most) [best, most] = [id, n];
    }
    return best;
  });

  return POINT_IDS.map((id) => {
    const index = owner.indexOf(id);
    if (index === -1) return { id, status: "not_addressed", rebutted: false, evidence: "", development_evidence: "" };
    const sentence = sentences[index];
    if (REBUTTAL.test(sentence)) return { id, status: "restated", rebutted: true, evidence: sentence, development_evidence: "" };
    const next = owner[index + 1] === null || owner[index + 1] === id ? sentences[index + 1] : undefined;
    const support = REASON.test(sentence) ? sentence : next && REASON.test(next) ? next : null;
    return support
      ? { id, status: "developed", rebutted: false, evidence: sentence, development_evidence: support }
      : { id, status: "restated", rebutted: false, evidence: sentence, development_evidence: "" };
  });
}

/** Linkers and structures the mock counts as C1 range (and B2 range below). */
export const MOCK_C1_MARKERS = [
  "what's more",
  "that said",
  "not to mention",
  "having weighed",
  "all things considered",
  "on balance",
  "admittedly",
  "nevertheless",
  "closely linked",
  "by contrast",
  "it could be argued",
  "in the long run",
  "far from",
  "rather than",
] as const;
export const MOCK_B2_LINKERS = ["however", "although", "on the other hand", "as a result", "for example", "for instance", "besides", "in my opinion", "because"] as const;

export function mockCount(transcript: string, phrases: readonly string[]): number {
  const text = ` ${evidenceTokens(transcript).join(" ")} `;
  return phrases.filter((phrase) => text.includes(` ${evidenceTokens(phrase).join(" ")} `)).length;
}
