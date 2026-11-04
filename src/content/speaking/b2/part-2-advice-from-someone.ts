import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are a personal story; question 3 is a general opinion question. Question 3 is the common trap:
 * talking about your own story again does not answer it.
 */
export const b2Part2AdviceFromSomeone: SpeakingTask = {
  id: "b2-part2-advice-from-someone",
  // v2: the picture was added (v1 had none). The questions and guidance are unchanged.
  version: 2,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "Advice from someone",
  topic: "People & relationships",
  question: "Describe a time when you received advice from someone. Answer the three questions below.",
  prompts: [
    "Who gave you the advice, and what situation were you in?",
    "What was the advice, and did you follow it?",
    "Do you think young people should always follow advice from older people? Why or why not?",
  ],
  picture: {
    src: "/tasks/advice-from-someone.svg",
    alt: "An older man with grey hair and glasses sits on a park bench and talks to a teenage girl beside him, one hand raised as he explains something. She holds a notebook and listens.",
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
    "Questions 1 and 2 are about ONE specific time the student received advice.",
    "Question 1 is answered when the student says who gave the advice and what situation they were in.",
    "Question 2 is answered when the student says what the advice was and whether they followed it.",
    "General statements about advice that never describe a specific time do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about young people and advice from older people. It is answered only when the student gives a general view (with or without a reason) about whether young people should always follow older people's advice.",
    "Talking about the student's own story again (e.g. 'I'm glad I listened to him', 'it taught me that…') does NOT answer question 3: mark it missing unless a general view about young people is given.",
    "The picture only sets the scene. Describing it (e.g. 'the man is giving advice to the girl', 'they are sitting on a bench') answers none of the questions, even though it uses the word 'advice'.",
    "Typical topic vocabulary at B2: take someone's advice, follow advice, it turned out, looking back, experience, blindly, make your own decisions, out of date.",
  ].join("\n"),
};
