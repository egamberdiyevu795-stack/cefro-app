import type { SpeakingTask } from "@/domain/speaking/task";
import { PART1_QUESTION_AUDIO, part1AudioDir } from "./question-audio";

const AUDIO = part1AudioDir("b1-part1-2-shopping", 2);

/** Spoken before Question 4 (our own wording), then the sample chime. */
const INTRO = "Part 1.2. Now you will look at two pictures and answer three questions about them. Start speaking when you hear this sound.";

const QUESTIONS = [
  // The exam's own words (owner decision 2026-11-15, replacing our "Look at the two pictures. Describe them and say how they
  // are different."). Version 2.
  "What can you see in these pictures?",
  "Why do many people like shopping at local markets?",
  "Why do some people prefer big supermarkets?",
];

const CEFRO_PICTURE = {
  width: 480,
  height: 360,
  author: "CEFRO (original illustration, 2026; not based on any existing image)",
  licence: "© 2026 CEFRO. All rights reserved.",
  retrievedAt: "2026-11-08",
} as const;

/**
 * Multilevel Part 1.2 (official Questions 4–6): two pictures on one topic, then three questions, target B1.
 * Timings (owner checked the real exam, 2026-11-08): get ready 10 s + 5 s + 5 s, speak 45 s + 30 s + 30 s. Our own topic, wording and pictures.
 */
export const b1Part12Shopping: SpeakingTask = {
  id: "b1-part1-2-shopping",
  version: 2,
  level: "B1",
  part: 1,
  taskType: "picture_questions",
  rubricId: "multilevel-q4-6",
  title: "Where people shop",
  topic: "Shopping",
  question: "Look at the two pictures and answer three questions about them.",
  prompts: QUESTIONS,
  images: [
    {
      ...CEFRO_PICTURE,
      src: "/tasks/part1/local-market.svg",
      sourceUrl: "public/tasks/part1/local-market.svg",
      alt: "An open-air market: a seller in an apron stands behind a wooden stall with boxes of tomatoes, apples and green vegetables under a striped awning. A woman with a cloth bag points at the fruit.",
    },
    {
      ...CEFRO_PICTURE,
      src: "/tasks/part1/supermarket.svg",
      sourceUrl: "public/tasks/part1/supermarket.svg",
      alt: "Inside a large supermarket: long shelves full of packets and bottles under bright ceiling lights. A man pushes a full shopping trolley along the aisle towards the checkouts.",
    },
  ],
  instructions: [
    "You will see two pictures and hear three questions about them, one after another.",
    "After each question you have time to get ready: 10 seconds for the first, 5 seconds for the others.",
    "Then you hear a chime: start speaking. You have 45 seconds for the first answer and 30 seconds for the others. A chime also tells you when the time is up.",
    "The next question starts automatically.",
    "Headphones are recommended.",
  ],
  preparationSeconds: 0,
  speakingSeconds: 105,
  delivery: {
    firstQuestionNumber: 4,
    intro: { text: INTRO, audio: `${AUDIO}/intro.wav` },
    questions: [
      {
        text: QUESTIONS[0],
        audio: `${AUDIO}/q4.wav`,
        prepSeconds: 10,
        speakingSeconds: 45,
        partialHint: "talk about both pictures",
      },
      { text: QUESTIONS[1], audio: `${AUDIO}/q5.wav`, prepSeconds: 5, speakingSeconds: 30 },
      { text: QUESTIONS[2], audio: `${AUDIO}/q6.wav`, prepSeconds: 5, speakingSeconds: 30 },
    ],
    audioSource: PART1_QUESTION_AUDIO,
  },
  evaluatorGuidance: [
    "Picture A shows a small open-air market: a seller behind a wooden stall of fresh fruit and vegetables, a customer with a cloth bag, outdoors.",
    "Picture B shows a large supermarket: long shelves of packaged goods and bottles, bright lights, a man pushing a full trolley indoors.",
    "Question 4 (the student's first question, 'What can you see in these pictures?') is on topic when the student describes BOTH pictures. Comparing them is welcome and is good evidence for language and cohesion, but it is not needed for on topic: outdoors vs indoors, small vs big, fresh / loose food vs packets and bottles, talking to a seller vs serving yourself, a cloth bag vs a trolley.",
    "Question 4 is partial when the student describes only one picture.",
    "Question 5 asks why people like local markets (e.g. fresh food, lower prices, bargaining, knowing the seller, supporting local farmers).",
    "Question 6 asks why some people prefer supermarkets (e.g. everything in one place, fixed prices, opening hours, parking, cards accepted, clean and cool inside).",
    "A bare one-sentence answer with no reason or detail (e.g. 'Because it is cheap.') is partial in Part 1.2: it counts, but the feedback asks for a reason or detail.",
    "Typical vocabulary at B1: fresh, price, cheap, expensive, choice, crowded, convenient, quality, stall, seller, trolley, checkout.",
  ].join("\n"),
};
