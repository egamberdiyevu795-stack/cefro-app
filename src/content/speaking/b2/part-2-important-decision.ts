import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2ImportantDecision: SpeakingTask = {
  id: "b2-part2-important-decision",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "An important decision",
  topic: "Life choices",
  question: "Describe an important decision you made. Answer the three questions below.",
  prompts: [
    "What was the decision, and when did you make it?",
    "Why did you decide this, and how did it change your life?",
    "Is it better to make big decisions alone or to ask others for help? Why?",
  ],
  picture: {
    src: "/tasks/important-decision.svg",
    alt: "A young man stands where a path splits in two, one hand on his chin, thinking. One path leads to a small house among trees, the other to a town with tall buildings. A signpost with two blank boards points both ways.",
    width: 480,
    height: 360,
    source: "Original illustration made for CEFRO (2026). Not based on any existing image.",
    licence: "CC0 1.0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  instructions: [
    "You will have 1 minute to prepare. You may make notes on paper.",
    "Then speak for up to 2 minutes. Try to use most of the time.",
    "Answer all three questions. Each one you leave out lowers your band.",
    "Questions 1 and 2 are about your own story; question 3 asks for your general opinion.",
  ],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "Questions 1 and 2 are about ONE specific decision the student made.",
    "Question 1 is answered when the student says what the decision was and when they made it.",
    "Question 2 is answered when the student says why they made this decision and how it changed their life.",
    "General statements about decisions that never describe a specific decision the student made do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about how people should make big decisions. It is answered only when the student gives a general view (with or without a reason) about whether it is better to make big decisions alone or to ask others for help.",
    "Talking about the student's own story again (e.g. 'my parents helped me decide', 'I'm glad I chose it myself') does NOT answer question 3: mark it missing unless a general view about making big decisions is given.",
    "The picture only sets the scene. Describing it (e.g. 'the man is thinking which way to go', 'one road goes to the city and one to a house') answers none of the questions, even though it shows a choice.",
    "Typical topic vocabulary at B2: make up my mind, weigh up the pros and cons, it was a turning point, looking back, regret, on my own, take responsibility, get a second opinion.",
  ].join("\n"),
};
