import "server-only";

/**
 * The "sentence_fixes" rules, shared by the Part 1.1 / 1.2, Part 2 and Part 3 prompts (docs/v1-plan.md §3.3, step 5).
 * NOT live-tested: no model has been called with this text (docs/feedback-review.md, "Sentences to improve").
 * The same rules are enforced again in code (domain/evaluation/sentence-fixes.ts), so a model that ignores one has the
 * item dropped, not shown.
 */
export function sentenceFixesRules(learnerLevel: string): string {
  return `- "sentence_fixes": up to 8 places where the student's own words contain ONE language mistake (grammar or word choice), most important first. A mistake that hides the meaning, or one the student repeats, comes before a small slip. Each item has:
  - "you_said": the student's own words, copied exactly from the transcript with the mistake in them (one clause or sentence, at most 25 words). Never correct, shorten with "…" or paraphrase it.
  - "better": the SAME words with only that one mistake fixed. Keep the student's words, their order and their idea. Do not add a new idea, a reason or an example, do not make it more advanced, and do not make it more than 3 words longer. It is never a rewritten answer and never a model answer.
  - "why": one short line (at most 20 words), in plain words a ${learnerLevel} learner understands, naming the rule that was broken. About grammar or word choice only.
  One mistake per item: if a sentence has two mistakes, fix the more important one in this item and quote a different part of the sentence for the other. Items must not overlap. Do not list a correct sentence, a style preference or a mistake you are not sure about: if there is no clear mistake, "sentence_fixes" is an empty list. The same mistake may also appear in "errors"; write both the same way.
  You only have the written transcript: never write a sentence fix about pauses, fillers, speed, hesitation or pronunciation.`;
}
