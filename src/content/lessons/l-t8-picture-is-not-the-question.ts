import type { Lesson } from "./types";

/** docs/lessons/drafts/L-T8-picture-is-not-the-question.md, word for word. Approved by Asadbek on 2026-11-07;
 * drill set version 2 (docs/lessons/drill-drafts.md) approved by Asadbek on 2026-11-07. */
export const lessonT8: Lesson = {
  id: "L-T8",
  slug: "l-t8",
  variantLabel: "Part 2 (B2)",
  version: 2,
  title: "The picture is not the question",
  targetLevel: "B2",
  problems: ["P-Q-PICTURE"],
  parts: [2],
  status: "approved",
  draftedBy: "ai",
  writtenAt: "2026-11-05",
  reviewedBy: "Asadbek",
  reviewedAt: "2026-11-07",
  source: "docs/lessons/drafts/L-T8-picture-is-not-the-question.md",
  madeUpNote: "All examples in this lesson are **made up** for teaching. None comes from a real student.",
  why: {
    default: "Your answer described the picture, but it did not answer the three questions. {evaluator note}",
  },
  explanation: [
    {
      kind: "p",
      text: 'The picture in Part 2 only shows the topic. It is not a question, and describing it scores nothing. "In the picture, two people are standing in a park" answers no question, even if it uses a word from the question. An answer that only describes the picture gets band 0.',
    },
    {
      kind: "p",
      text: "Read the three questions, not the picture. The first questions usually ask about **your own** experience: your story, not the people in the picture. Question 3 asks for **your** opinion. If no story comes quickly, use a simple true one from your own life, even a small one. You can look at the picture for an idea, but then talk about yourself.",
    },
  ],
  exampleTopic: {
    intro: 'Example topic (made up, **not** the retry task): *"Describe a time when someone helped you."*',
    title: "Describe a time when someone helped you.",
    questions: [
      "Who helped you, and what situation were you in?",
      "How did they help you, and how did you feel?",
      "Do you think people help each other less today than in the past? Why or why not?",
    ],
    picture: "Example picture (made up): a young man helping an older woman carry shopping bags in the street.",
    note: "These examples use a different topic from your task, so you practise the skill, not the words.",
  },
  examples: [
    {
      problem: "Describes the scene instead of Question 1",
      weaker: "In the picture I can see a young man and an old woman. They are standing in the street.",
      better: "When I first moved to a new city, my landlady helped me find my way around.",
      note: "Question 1 asks who helped **you**. Start with your own story.",
      madeUp: true,
    },
    {
      problem: "Uses the topic word about the picture",
      weaker: "The young man is helping the woman, and she is smiling.",
      better: "She showed me where the market and the bus stop were, and I felt much less lonely.",
      note: 'Saying "helping" about the people in the picture does not count. Say how **you** were helped and how you felt.',
      madeUp: true,
    },
    {
      problem: "Guesses about the people instead of Question 3",
      weaker: "Maybe she is his grandmother. I think he is a kind person.",
      better: "In my view, people in big cities help each other less than before, because they don't know their neighbours, but in villages it's still different.",
      note: "Question 3 asks for your general opinion, not a guess about the picture.",
      madeUp: true,
    },
    {
      problem: "Starts with the picture and stays there",
      weaker: "This picture shows a street. The bags look heavy and the woman looks tired.",
      better: "This picture reminds me of my first week in Tashkent. I was carrying all my things from the station when a stranger offered to help.",
      note: "One short link from the picture to your own story is fine, as long as the story follows straight away.",
      madeUp: true,
    },
  ],
  drill: {
    intro: "Record each prompt, listen back, then tick the checklist. Self-check only, no AI scoring.",
    topic: {
      intro: "Drill topic (made up): *\"Describe a skill you learned outside school.\"*",
      title: "Describe a skill you learned outside school.",
      questions: [
        "What was the skill, and who taught you?",
        "How long did it take, and how did you feel when you could do it?",
        "Is it better to learn new skills from a person or from videos online? Why?",
      ],
      picture: "Drill picture (made up): a boy learning to ride a bicycle in a park while his older sister holds the seat.",
    },
    items: [
      { prompt: "Without looking at the picture, say what skill you learned and who taught you.", seconds: 20 },
      { prompt: "Give your opinion: is it better to learn new skills from a person or from videos online? Give one reason.", seconds: 30 },
      { prompt: "Start with \"This picture reminds me of…\" and move into your own story within one sentence.", seconds: 20 },
    ],
    checklist: [
      "I talked about my own experience, not the people in the picture.",
      "I did not describe what the people in the picture are doing or wearing.",
      "I gave my own opinion for Question 3.",
    ],
  },
  retry: {
    intro: "Same task, same timings: 1 minute preparation, 2 minutes speaking. Scored by the AI as a normal retry.",
    objective: 'Answer question 1: "Who gave you the advice, and what situation were you in?"',
    successCheck: "You say at least two sentences that answer question 1, with one reason or example.",
    reminder: "Don't describe the picture. Tell your own story (Questions 1–2), then give your opinion (Question 3).",
  },
};
