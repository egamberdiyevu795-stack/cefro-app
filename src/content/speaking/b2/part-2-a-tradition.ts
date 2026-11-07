import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2ATradition: SpeakingTask = {
  id: "b2-part2-a-tradition",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "A tradition",
  topic: "Culture & traditions",
  question: "Describe a tradition in your family or your country. Answer the three questions below.",
  prompts: [
    "What is the tradition, and when does it happen?",
    "How does your family take part, and what do you enjoy about it?",
    "Should young people keep old traditions in the modern world? Why?",
  ],
  picture: {
    src: "/tasks/a-tradition.svg",
    alt: "Three generations of a family sit together behind a long table: a grandmother with grey hair, a father, a mother and a young boy. On the table are a large shared dish, round flat breads, a teapot and small bowls. A string of small coloured flags hangs above them.",
    width: 480,
    height: 360,
    source: "Original illustration made for CEFRO (2026). Not based on any existing image.",
    licence: "© 2026 CEFRO. All rights reserved.",
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
    "Questions 1 and 2 are about ONE specific tradition the student knows from their own family or country.",
    "Question 1 is answered when the student says what the tradition is and when it happens.",
    "Question 2 is answered when the student says how their own family takes part and what they enjoy about it.",
    "General statements about traditions that never name a specific tradition, or never say how the student's own family takes part, do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about young people and old traditions. It is answered only when the student gives a general view (with or without a reason) about whether young people should keep old traditions in the modern world.",
    "Talking about the student's own tradition again (e.g. 'I love this holiday', 'my family will always do it') does NOT answer question 3: mark it missing unless a general view about young people and old traditions is given.",
    "The picture only sets the scene. Describing it (e.g. 'the family is eating together', 'there are flags above the table') answers none of the questions, even though it shows a family celebration.",
    "Typical topic vocabulary at B2: celebrate, take place, get together, pass down from generation to generation, customs, old-fashioned, preserve, roots, keep alive.",
  ].join("\n"),
};
