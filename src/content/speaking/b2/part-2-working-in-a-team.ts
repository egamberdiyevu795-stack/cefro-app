import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Questions 1–2 are about the student's own experience; question 3 is a general opinion question. Question 3 is the
 * common trap: talking about your own story again does not answer it.
 */
export const b2Part2WorkingInATeam: SpeakingTask = {
  id: "b2-part2-working-in-a-team",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "Working in a team",
  topic: "Work & study",
  question: "Describe a time when you worked in a team. Answer the three questions below.",
  prompts: [
    "What was the task, and who was in the team?",
    "What was your role, and how did the team do?",
    "Do people achieve more working alone or in a team? Why?",
  ],
  picture: {
    src: "/tasks/working-in-a-team.svg",
    alt: "Four young people work together around a table in a classroom. On the table are a large sheet of paper with simple drawn shapes and a small model made of coloured blocks. One of them points at the paper, another adds a block to the model.",
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
    "Questions 1 and 2 are about ONE specific time the student worked in a team.",
    "Question 1 is answered when the student says what the task was and who was in the team.",
    "Question 2 is answered when the student says what their own role was and how the team did.",
    "General statements about teamwork that never describe a specific time the student worked in a team do NOT answer questions 1 or 2: mark them missing.",
    "Question 3 is a GENERAL opinion question about working alone and working in a team. It is answered only when the student gives a general view (with or without a reason) about whether people achieve more working alone or in a team.",
    "Talking about the student's own story again (e.g. 'our team won', 'I liked working with my friends') does NOT answer question 3: mark it missing unless a general view about people working alone or in a team is given.",
    "The picture only sets the scene. Describing it (e.g. 'four students are working together at a table', 'one boy is pointing at the paper') answers none of the questions, even though it shows a team.",
    "Typical topic vocabulary at B2: work together, share the work, take the lead, be responsible for, cooperate, rely on each other, divide the tasks, a team player.",
  ].join("\n"),
};
