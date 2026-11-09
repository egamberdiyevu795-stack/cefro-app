import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";

/**
 * MOCK EVALUATOR ONLY. Two rough rules the development evaluator uses so mock mode can show the lessons for a
 * picture-only answer (L-T8) and a bare one-sentence answer (L-T4). Never read by real scoring: not by the prompt, the
 * quality gate, the band scoring or any real provider (a test checks that only `mock-evaluation-model.ts` imports
 * this file, and that the mock evaluator is refused in production).
 */

/** A sentence that talks about the picture itself ("In the picture I can see…"). */
export const MOCK_PICTURE_WORDS = /\b(picture|photo|image)\b|\bi can see\b/i;

/** A question answered only in one sentence this short (in words) is "minimal": a bare answer that does not count. */
export const MOCK_MINIMAL_MAX_WORDS = 6;

/** Picture only: every sentence talks about the picture, so the answer answers no question (all off topic). */
export function mockIsPictureOnly(sentences: readonly string[]): boolean {
  return sentences.length > 0 && sentences.every((s) => MOCK_PICTURE_WORDS.test(s));
}

/** Too short to count: the question's key words appear in one sentence only, of at most 6 words. */
export function mockIsMinimal(hits: readonly string[]): boolean {
  return hits.length === 1 && evidenceTokens(hits[0]).length <= MOCK_MINIMAL_MAX_WORDS;
}
