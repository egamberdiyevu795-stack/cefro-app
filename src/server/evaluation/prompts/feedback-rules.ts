import "server-only";

/**
 * Rules for the student-facing advice fields (docs/feedback-review.md issues 1–4), shared by the Part 1.1 / 1.2 and
 * Part 2 prompts (evaluator 3.8.0). Issue 2 (fluency claims without audio) is `transcriptFluencyRule`; issues 1, 3 and
 * 4 are `adviceRules`. They change only what the model WRITES, never how it judges a level, so no band should move
 * (checked on the live anchors).
 */
export function adviceRules(taskTopic: string): string {
  return `# Advice rules (every "how_to_improve" and "how_to_check", and each error pattern's "rule" and "how_to_fix")
- ONE issue each. A feature's "how_to_improve" and "how_to_check" are about one single issue. For grammar and vocabulary, when you list errors of that feature, the issue is the one the FIRST of those errors shows: the same rule its correction fixes (e.g. first grammar error "my father give me" → "my father gave me": the issue is the past simple, not conditionals). Never join two issues or two structures with "and" or "or" (not "use a conditional or a relative clause", not "use past verbs and add 'to' after 'want'"). Several examples of the same rule are fine.
- A SKILL, not a phrase. "how_to_improve" describes a skill and where to use it (e.g. "Use one conditional to say how something could have turned out differently"). "how_to_check" says how the student can see in their own answer that they used that skill where it fits (e.g. "Every finished action in your story has a past form"). Never require a set word, phrase or sentence opening: not "start a sentence with 'Not only'", not "include 'on the other hand'", not "count how many times you say 'however'". A phrase may appear only as one example, after "for example".
- Examples on ANOTHER topic. The task is about: ${taskTopic}. Every example sentence or phrase you write in these fields uses a different, unrelated everyday topic (e.g. school, sport, a journey, a hobby), never the task's people, situation, questions or key words. Show the structure with a sentence the student could NOT copy into this answer. Exceptions: "correction" in errors and "better" in sentence_fixes (they fix the student's own words), "model_answer", and naming a better word for one the student actually used.`;
}

/** Issue 2: without audio the model cannot hear pauses, speed or smoothness. */
export const transcriptFluencyRule = `- Fluency wording: you only have the written transcript, so you cannot hear the answer. In the fluency "note", "how_to_improve" and "how_to_check", never say the student spoke smoothly, fluently, steadily or naturally, never say "without pauses", "without hesitation" or "without fillers", never describe their pace or speed (fast, slow, steady, words per minute), and never praise or criticise "the flow". Describe only what the text shows: written fillers ("um", "uh"), repeated words, restarted or unfinished sentences, how long or short the sentences are, and how long they spoke in seconds (e.g. "You spoke for 60 of the 120 seconds, in short, simple sentences"). "how_to_check" is something the student can see in their own transcript or on the timer (e.g. "You used at least 100 of the 120 seconds"), never how it sounded.`;
