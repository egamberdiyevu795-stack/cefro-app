import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2TryingAndFailing: SpeakingTask = {
  id: "b2-part2-trying-and-failing",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "Trying and failing",
  topic: "Challenges",
  question: "Describe a time when you tried to do something and failed. Answer the three questions below.",
  prompts: [
    "What were you trying to do, and why?",
    "What went wrong, and how did you feel?",
    "Can failure be useful for young people? Why or why not?",
  ],
  picture: {
    src: "/tasks/trying-and-failing.svg",
    alt: "A teenage boy in a helmet sits on the ground in a park, one hand on his knee. His skateboard has rolled away from him and lies upside down on the path.",
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
    "Questions 1 and 2 are about ONE specific time the student tried to do something and failed.",
    "Question 1 is answered when the student says what they were trying to do and why.",
    "Question 2 is answered when the student says what went wrong and how they felt.",
    "General statements about failure that never describe a specific time the student failed do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about young people and failure. It is answered only when the student gives a general view (with or without a reason) about whether failure can be useful for young people.",
    "Talking about the student's own story again (e.g. 'it taught me to prepare better', 'next time I passed') does NOT answer question 3: mark it missing unless a general view about failure and young people is given.",
    "The picture only sets the scene. Describing it (e.g. 'the boy fell off his skateboard', 'he is sitting on the ground') answers none of the questions, even though it shows a failure.",
    "Typical topic vocabulary at B2: give it a try, it went wrong, fail, disappointed, embarrassed, learn from mistakes, try again, it didn't work out, build confidence.",
  ].join("\n"),
};
