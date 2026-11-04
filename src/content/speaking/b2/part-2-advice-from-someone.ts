import type { SpeakingTask } from "@/domain/speaking/task";

export const b2Part2AdviceFromSomeone: SpeakingTask = {
  id: "b2-part2-advice-from-someone",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "b2-long-turn",
  title: "Advice from someone",
  topic: "People & relationships",
  question: "Describe a time when you received advice from someone.",
  prompts: [
    "Who gave you the advice, and what situation were you in?",
    "What was the advice, and did you follow it?",
    "Do you think young people should always follow advice from older people? Why or why not?",
  ],
  instructions: [
    "You will have 1 minute to prepare. You may make notes on paper.",
    "Then speak for up to 2 minutes. Try to use most of the time.",
    "Answer the question and cover all three points.",
    "Points 1 and 2 are about your own story; point 3 asks for your general opinion.",
  ],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "Points 1 and 2 are a personal story: a specific time, who gave the advice, the situation, what the advice was, and whether the student followed it.",
    "Point 3 is a GENERAL opinion question about young people and advice from older people. Talking about the student's own story again (e.g. 'I'm glad I listened to him', 'it taught me…') does NOT answer point 3: mark it not_covered unless the student gives a general view about young people.",
    "General statements about advice that never describe a specific time do NOT cover points 1 and 2: mark them not_covered.",
    "A strong B2 answer narrates the story clearly with past tenses and sequencing, then gives a reasoned general opinion that weighs both sides (however, on the other hand, that said).",
    "It uses a range of structures: narrative tenses (past perfect, past continuous), reported speech for the advice ('he told me to…', 'she advised me to…'), third conditionals for reflection, modals for opinion.",
    "Common weaker patterns: only general talk about advice with no story, retelling the story instead of answering point 3, listing points without development, stopping well before the time limit.",
  ].join("\n"),
};
