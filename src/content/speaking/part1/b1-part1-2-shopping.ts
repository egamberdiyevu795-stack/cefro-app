import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { PART1_CHIME, PLACEHOLDER_AUDIO_SOURCE } from "./chime";

const AUDIO = "/audio/speaking/part1/placeholder";

/**
 * Part 1.2 (Questions 4–6, two pictures on one topic). Official timings: 45 s + 30 s + 30 s, no preparation.
 * Our own topic and wording. The pictures (licensed, with source fields) come with the picture panel, not in this piece.
 */
export const b1Part12Shopping: QuestionSequenceTask = {
  id: "b1-part1-2-shopping",
  version: 1,
  part: "1.2",
  title: "Where people shop",
  firstQuestionNumber: 4,
  instructions: [
    "You will see two pictures and hear three questions about them, one after another.",
    "After each question you hear a chime. Start speaking at the chime: 45 seconds for the first answer, 30 seconds for the others.",
    "There is no preparation time. The next question starts automatically.",
    "Headphones are recommended.",
  ],
  questions: [
    {
      text: "Look at the two pictures. Describe them and say how they are different.",
      audio: `${AUDIO}/part1-2-q4.wav`,
      prepSeconds: 0,
      speakingSeconds: 45,
      partialHint: "Describes only one picture, or describes both without comparing them.",
    },
    { text: "Why do many people like shopping at local markets?", audio: `${AUDIO}/part1-2-q5.wav`, prepSeconds: 0, speakingSeconds: 30 },
    { text: "Why do some people prefer big supermarkets?", audio: `${AUDIO}/part1-2-q6.wav`, prepSeconds: 0, speakingSeconds: 30 },
  ],
  chime: PART1_CHIME,
  audioSource: PLACEHOLDER_AUDIO_SOURCE,
};
