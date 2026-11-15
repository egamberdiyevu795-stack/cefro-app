import "server-only";

/**
 * MOCK EVALUATOR ONLY. Never read by the real evaluation: not by the prompt, the quality gate, the band scoring or any
 * real provider (a test checks that only `mock-evaluation-model.ts` imports this file).
 *
 * The development evaluator decides whether a question was answered by counting key words of that question in the
 * transcript (2 or more: answered; 1: partly; 0: missing). Taken from the question text alone, many questions have too
 * few (e.g. "What was the task, and who was in the team?" has none longer than 4 letters), so a full answer could
 * never count. These lists are the words a student answering that question is likely to say, per task, question 1–3.
 * Lower case, matched as whole words. Question 3's words are kept out of the questions 1–2 lists, so an answer that
 * only tells the story leaves question 3 missing.
 */
export const MOCK_QUESTION_KEYWORDS: Record<string, readonly [readonly string[], readonly string[], readonly string[]]> = {
  "b2-part2-advice-from-someone": [
    ["advice", "gave", "got", "situation", "difficult", "problem", "grandfather", "grandmother", "father", "mother", "parents", "teacher", "friend", "uncle", "aunt"],
    ["advice", "told", "said", "follow", "followed", "listen", "listened", "decided", "suggested"],
    ["young", "older", "always", "should", "generation", "experience"],
  ],
  "b2-part2-important-decision": [
    ["decision", "decided", "made", "move", "moved", "chose", "ago", "years", "when"],
    ["because", "reason", "why", "decide", "change", "changed", "life"],
    ["better", "alone", "others", "help", "ask", "view", "opinion"],
  ],
  "b2-part2-goal-you-set": [
    ["goal", "chose", "choose", "because", "wanted", "why"],
    ["reach", "reached", "succeed", "succeeded", "trained", "practised", "ran", "worked", "proud", "months"],
    ["never", "people", "reasons", "motivation", "realistic", "big", "small", "step", "lazy"],
  ],
  "b2-part2-working-in-a-team": [
    ["task", "project", "team", "school", "make", "made", "friends", "cousin", "classmates", "colleagues"],
    ["role", "job", "responsible", "organise", "organised", "write", "wrote", "did", "result", "won", "well"],
    ["achieve", "alone", "together", "people", "working", "more"],
  ],
  "b2-part2-trying-and-failing": [
    ["trying", "tried", "try", "wanted", "because", "hoped", "dream"],
    ["wrong", "failed", "lost", "mistake", "felt", "feel", "nervous", "sad", "terrible", "upset"],
    ["failure", "failing", "useful", "learn", "young", "people", "success"],
  ],
  "b2-part2-a-tradition": [
    ["tradition", "holiday", "celebrate", "festival", "happens", "every", "year", "spring", "march", "when"],
    ["family", "together", "cook", "enjoy", "takes", "part", "grandmother", "favourite"],
    ["young", "keep", "modern", "world", "old", "traditions", "generation", "should", "future"],
  ],
  "b2-part2-happy-day": [
    ["where", "when", "last", "summer", "winter", "lake", "park", "village", "city", "with", "parents"],
    ["happened", "happy", "because", "came", "spent", "celebrated", "surprise", "smiling"],
    ["money", "happier", "rich", "buy", "happiness", "matter"],
  ],
};
