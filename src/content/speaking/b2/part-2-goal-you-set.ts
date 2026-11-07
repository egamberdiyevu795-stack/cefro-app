import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2GoalYouSet: SpeakingTask = {
  id: "b2-part2-goal-you-set",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "A goal you set",
  topic: "Goals & ambition",
  question: "Describe a goal you set for yourself. Answer the three questions below.",
  prompts: [
    "What was the goal, and why did you choose it?",
    "What did you do to reach it, and did you succeed?",
    "Why do some people never reach their goals?",
  ],
  picture: {
    src: "/tasks/goal-you-set.svg",
    alt: "A young woman with a backpack walks up a winding path on a green hill. At the top of the hill, still far ahead of her, a small red flag stands on a pole.",
    width: 480,
    height: 360,
    source: "Original illustration made for CEFRO (2026). Not based on any existing image.",
    licence: "© 2026 CEFRO. All rights reserved.",
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
    "Questions 1 and 2 are about ONE specific goal the student set for themselves.",
    "Question 1 is answered when the student says what the goal was and why they chose it.",
    "Question 2 is answered when the student says what they did to reach the goal and whether they succeeded (succeeding, partly succeeding or not succeeding all count).",
    "General statements about goals that never describe a specific goal the student set do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about people and goals. It is answered only when the student gives a general view about why some people never reach their goals (at least one general reason, e.g. they give up, their goals are not realistic, they have no plan).",
    "Talking about the student's own story again (e.g. 'I almost gave up too', 'I succeeded because I worked hard') does NOT answer question 3: mark it missing unless a general view about why some people never reach their goals is given.",
    "The picture only sets the scene. Describing it (e.g. 'the girl is walking up the hill', 'there is a red flag at the top') answers none of the questions, even though it shows someone working towards a goal.",
    "Typical topic vocabulary at B2: set a goal, achieve, work towards, stick to a plan, give up, motivation, realistic, step by step, it paid off.",
  ].join("\n"),
};
