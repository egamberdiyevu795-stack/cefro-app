import type { Lesson } from "./types";

/** docs/lessons/drafts/L-T1-answer-every-question.md, word for word. Approved by Asadbek on 2026-11-07;
 * drill set version 2 (docs/lessons/drill-drafts.md) approved by Asadbek on 2026-11-07. */
export const lessonT1: Lesson = {
  id: "L-T1",
  slug: "l-t1",
  variantLabel: "Part 2 (B2)",
  version: 2,
  title: "Answer every question",
  targetLevel: "B2",
  problems: ["P-Q-MISSING"],
  parts: [2],
  status: "approved",
  draftedBy: "ai",
  writtenAt: "2026-11-05",
  reviewedBy: "Asadbek",
  reviewedAt: "2026-11-07",
  source: "docs/lessons/drafts/L-T1-answer-every-question.md",
  madeUpNote: "All examples in this lesson are **made up** for teaching. None comes from a real student.",
  why: {
    default: 'You did not answer Question {n}: "{question text}". {evaluator note for Question {n}}',
  },
  explanation: [
    {
      kind: "p",
      text: "In Part 2 you get three questions and two minutes. Every question you leave out lowers your band, however good your English is. If you answer two questions out of three, the highest band you can get is 3.",
    },
    {
      kind: "p",
      text: "Use your minute of preparation to write one short note for each question. Then speak in the same order: Question 1, Question 2, Question 3. Start each answer with a sentence that clearly answers that question, so the listener knows where you are. Watch the time. After about 40 seconds on one question, move on to the next one. A short answer to every question is better than a long answer to one.",
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
    note: "These examples use a different topic from your task, so you practise the skill, not the words.",
  },
  examples: [
    {
      problem: "Question 2 missing (skipped)",
      weaker: "…my neighbour saw that my bike was broken. Anyway, I think people today help each other less, because everyone is busy.",
      better:
        "…my neighbour saw that my bike was broken. He fixed the chain for me in ten minutes, and I felt really grateful. As for people today, I think they help each other less, because everyone is busy.",
      note: "The student jumps from the story (Question 1) straight to the opinion (Question 3): how they helped and how you felt is never said. Answer the questions in order.",
      madeUp: true,
    },
    {
      problem: "Question 3 missing (time ran out)",
      weaker: "…and then he drove me home, and my mother made tea for him, and he told us about his job… so yes, that's it.",
      better: "…so that was what happened. As for people in general, I think they still help each other, but more often online than face to face.",
      note: 'One bridge sentence ("As for people in general…") moves you from your story to Question 3.',
      madeUp: true,
    },
    {
      problem: "Question 1 missing",
      weaker: "He carried my bags to the bus, and I felt very relieved.",
      better: "It was a stranger at the bus station, when I was moving to Tashkent with three heavy bags. He carried them to the bus for me, and I felt very relieved.",
      note: 'Question 1 asks **who** helped you **and** what situation you were in. "He" alone doesn\'t say who. Say both first.',
      madeUp: true,
    },
    {
      problem: "Questions 1–2 missing (no specific time)",
      weaker: "Helping people is very important. In our culture, neighbours always help each other.",
      better: "One time I remember well is when a classmate helped me catch up after I was ill for two weeks. I was in Year 10 and worried about my exams.",
      note: "Questions 1 and 2 are about **one specific time**. General talk about helping does not answer them.",
      madeUp: true,
    },
  ],
  drill: {
    intro: "Record each prompt, listen back, then tick the checklist. Self-check only, no AI scoring.",
    topic: {
      intro: "Drill topic (made up): *\"Describe a place you like to visit.\"*",
      title: "Describe a place you like to visit.",
      questions: [
        "Where is the place, and how often do you go there?",
        "What do you do there, and why do you like it?",
        "Do you think young people spend enough time outdoors? Why or why not?",
      ],
    },
    items: [
      { prompt: "Where is the place, and how often do you go there? Answer, then add one detail (when, who with or why).", seconds: 20 },
      { prompt: "What do you do there, and why do you like it? Answer, then add one reason or what happened last time you went.", seconds: 20 },
      { prompt: "**Planning drill.** You have 60 seconds, as in the preparation minute. Say your three notes aloud, one for each question (place + how often / what you do + why / opinion + reason).", seconds: 60 },
    ],
    checklist: [
      "My plan had a note for every question.",
      "Each answer started with a sentence that answers that question, then added a reason or a detail.",
      "When a question had two parts, I answered both.",
    ],
  },
  retry: {
    intro: "Same task, same timings: 1 minute preparation, 2 minutes speaking. Scored by the AI as a normal retry.",
    objective: 'Answer question {n}: "{question text}"',
    successCheck: "You say at least two sentences that answer question {n}, with one reason or example.",
    reminder: "Plan one note per question. Answer them in order, and move on after about 40 seconds.",
  },
};
