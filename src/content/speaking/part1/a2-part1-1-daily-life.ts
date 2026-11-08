import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { PART1_CHIME, PLACEHOLDER_AUDIO_SOURCE } from "./chime";

const AUDIO = "/audio/speaking/part1/placeholder";

/** Part 1.1 (Questions 1–3, familiar personal topics). Official timings: 3 × 30 s, no preparation. Our own wording. */
export const a2Part11DailyLife: QuestionSequenceTask = {
  id: "a2-part1-1-daily-life",
  version: 1,
  part: "1.1",
  title: "Daily life",
  firstQuestionNumber: 1,
  instructions: [
    "You will hear three questions, one after another. Each question is also shown on screen.",
    "After each question you hear a chime. Start speaking at the chime: you have 30 seconds for each answer.",
    "There is no preparation time. The next question starts automatically.",
    "Headphones are recommended.",
  ],
  questions: [
    { text: "What do you usually do at the weekend?", audio: `${AUDIO}/part1-1-q1.wav`, prepSeconds: 0, speakingSeconds: 30 },
    { text: "What is your favourite food? Why?", audio: `${AUDIO}/part1-1-q2.wav`, prepSeconds: 0, speakingSeconds: 30 },
    { text: "Who do you spend the most time with in your family?", audio: `${AUDIO}/part1-1-q3.wav`, prepSeconds: 0, speakingSeconds: 30 },
  ],
  chime: PART1_CHIME,
  audioSource: PLACEHOLDER_AUDIO_SOURCE,
};
