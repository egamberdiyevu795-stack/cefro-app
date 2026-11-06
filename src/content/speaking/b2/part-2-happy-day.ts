import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2HappyDay: SpeakingTask = {
  id: "b2-part2-happy-day",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "A happy day",
  topic: "Feelings & well-being",
  question: "Describe a very happy day in your life. Answer the three questions below.",
  prompts: [
    "When and where was it, and who were you with?",
    "What happened that made you so happy?",
    "Does money make people happier? Why or why not?",
  ],
  picture: {
    src: "/tasks/happy-day.svg",
    alt: "Three young friends stand together on the grass beside a lake on a sunny day. They are all smiling, and the one in the middle has both arms raised. Birds fly over the water.",
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
    "Questions 1 and 2 are about your own experience; question 3 asks for your general opinion.",
  ],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "Questions 1 and 2 are about ONE specific happy day in the student's life.",
    "Question 1 is answered when the student says when and where it was and who they were with.",
    "Question 2 is answered when the student says what happened that made them so happy.",
    "General statements about happiness that never describe a specific day in the student's life do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about money and happiness. It is answered only when the student gives a general view (with or without a reason) about whether money makes people happier.",
    "Talking about the student's own day again (e.g. 'that day cost nothing', 'I was happy because I was with my friends') does NOT answer question 3: mark it missing unless a general view about money and people's happiness is given.",
    "The picture only sets the scene. Describing it (e.g. 'three friends are smiling by a lake', 'the girl is raising her arms') answers none of the questions, even though it shows happy people.",
    "Typical topic vocabulary at B2: unforgettable, over the moon, I'll never forget, it made my day, spend time with, the best part was, money can't buy, financial security.",
  ].join("\n"),
};
