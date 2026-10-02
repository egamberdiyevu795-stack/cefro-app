import type { SpeakingTask } from "@/domain/speaking/task";

export const b2Part2TechnologyYoungPeople: SpeakingTask = {
  id: "b2-part2-technology-young-people",
  version: 1,
  level: "B2",
  part: 2,
  title: "Technology and young people",
  topic: "Technology & society",
  question:
    "Some people say that smartphones and social media are making young people less sociable. Others believe technology helps young people build and keep friendships. What is your opinion?",
  prompts: [
    "How do you and people your age use technology to communicate?",
    "What are the main advantages and disadvantages of social media for young people?",
    "Should schools limit the use of smartphones? Why or why not?",
  ],
  instructions: [
    "You will have 1 minute to prepare. You may make notes on paper.",
    "Then speak for up to 2 minutes. Try to use most of the time.",
    "Answer the question and cover all three points.",
    "Give reasons and at least one specific example from your own experience.",
  ],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "A strong B2 answer states a clear position early and develops it with reasons.",
    "It covers all three prompts with balanced attention, not only the first one.",
    "It contrasts advantages and disadvantages using linking language (however, on the other hand, whereas).",
    "It includes at least one concrete personal or observed example rather than only general statements.",
    "It uses topic vocabulary beyond basic words (e.g. 'face-to-face interaction', 'screen time', 'distraction', 'stay in touch').",
    "It uses a range of structures: conditionals, relative clauses, modal verbs for speculation/recommendation.",
    "Common weaker patterns: listing points without development, repeating 'I think', stopping well before the time limit, ignoring the school question.",
  ].join("\n"),
};
