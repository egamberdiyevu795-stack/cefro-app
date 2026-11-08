import type { SpeakingTask } from "@/domain/speaking/task";
import { PART1_QUESTION_AUDIO, part1AudioDir } from "./question-audio";

const AUDIO = part1AudioDir("a2-part1-1-daily-life", 1);

/** Spoken before Question 1 (our own wording), then the sample chime. */
const INTRO = "Part 1.1. In this part, you will hear three short questions about yourself and your daily life. After each question, you have five seconds to get ready, and then thirty seconds to answer. Start speaking when you hear this sound.";

const QUESTIONS = [
  "What do you usually do at the weekend?",
  "What is your favourite food? Why?",
  "Who do you spend the most time with in your family?",
];

/**
 * Multilevel Part 1.1 (official Questions 1–3): three questions about familiar personal topics, target A2.
 * Timings: 5 s to prepare and 30 s to speak, per question (owner checked the real exam, 2026-11-08). Our own wording.
 */
export const a2Part11DailyLife: SpeakingTask = {
  id: "a2-part1-1-daily-life",
  version: 1,
  level: "A2",
  part: 1,
  taskType: "short_answers",
  rubricId: "multilevel-q1-3",
  title: "Daily life",
  topic: "Home, family and free time",
  question: "Answer three short questions about yourself.",
  prompts: QUESTIONS,
  instructions: [
    "You will hear three questions, one after another. Each question is also shown on screen.",
    "After each question you have 5 seconds to get ready. Then you hear a chime: start speaking. You have 30 seconds for each answer, and a chime tells you when the time is up.",
    "The next question starts automatically.",
    "Headphones are recommended.",
  ],
  preparationSeconds: 0,
  speakingSeconds: 90,
  delivery: {
    firstQuestionNumber: 1,
    intro: { text: INTRO, audio: `${AUDIO}/intro.wav` },
    questions: [
      { text: QUESTIONS[0], audio: `${AUDIO}/q1.wav`, prepSeconds: 5, speakingSeconds: 30 },
      { text: QUESTIONS[1], audio: `${AUDIO}/q2.wav`, prepSeconds: 5, speakingSeconds: 30 },
      { text: QUESTIONS[2], audio: `${AUDIO}/q3.wav`, prepSeconds: 5, speakingSeconds: 30 },
    ],
    audioSource: PART1_QUESTION_AUDIO,
  },
  evaluatorGuidance: [
    "Question 1 is answered when the student says anything relevant about what they do at the weekend (activities, places, people).",
    "Question 2 is answered when the student names a food they like; a reason is welcome but not needed for it to count.",
    "Question 3 is answered when the student names a family member they spend time with. Talking about friends, school or their city does not answer it.",
    "Single words or short phrases that answer the question count as on topic in Part 1.1 (for example 'Football.' for Question 1).",
    "Typical vocabulary at A2: weekend, usually, sometimes, play, watch, visit, cook, tasty, favourite, brother, sister, mother, together.",
  ].join("\n"),
};
