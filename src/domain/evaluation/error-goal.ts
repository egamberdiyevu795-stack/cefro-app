/**
 * The retry goal for a grammar or vocabulary fix that is shown with one of the student's own mistakes.
 *
 * "Biggest fix" shows one mistake (You said / Try instead) and, under it, the goal for the retry. The goal used to be the
 * model's general advice for the whole skill, written separately from that mistake, so the two could disagree: a missing
 * "a" shown above, a goal about word order below. The goal is now built from the mistake that is shown, so the card
 * tells one story. The mistake is chosen exactly as the result pages choose it: the first error of that skill (the model
 * lists the most serious first). Pure, so Part 1/2 and Part 3 share it.
 */
export interface GoalError {
  quote: string;
  correction: string;
  type: string;
  pattern?: string;
}
export interface GoalPattern {
  name: string;
  rule: string;
}

export function errorExampleGoal(
  assessment: { errors?: readonly GoalError[]; error_patterns?: readonly GoalPattern[] },
  feature: string,
): { objective: string; success_check: string } | null {
  if (feature !== "grammar" && feature !== "vocabulary") return null;
  const error = assessment.errors?.find((e) => e.type === feature);
  if (!error) return null;
  const pattern = error.pattern ? assessment.error_patterns?.find((p) => p.name === error.pattern) : undefined;
  if (pattern) {
    return {
      objective: `Stop this kind of mistake: ${pattern.name}. ${pattern.rule}`.trim(),
      success_check: `Your answer has no more mistakes of this kind: ${pattern.name}.`,
    };
  }
  // No named pattern: say what to do with the mistake shown above, without repeating it (the card already shows it).
  const kind = feature === "grammar" ? "grammar mistake" : "word-choice mistake";
  return {
    objective: `Look for the same kind of ${kind} in your other sentences, and correct it as shown above.`,
    success_check: `You do not repeat the mistake in "${error.quote}".`,
  };
}
