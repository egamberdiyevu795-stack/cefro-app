import type { Lesson } from "./types";

/** docs/lessons/drafts/L-T4-answer-reason-example-B2.md, word for word. Approved by the owner on 2026-11-07. */
export const lessonT4B2: Lesson = {
  id: "L-T4",
  slug: "l-t4-b2",
  variant: "B2",
  variantLabel: "B2 (Part 2)",
  version: 1,
  title: "Answer, reason, example",
  targetLevel: "B2",
  problems: ["P-Q-MINIMAL", "P-Q-PARTIAL"],
  parts: [2],
  status: "approved",
  draftedBy: "ai",
  writtenAt: "2026-11-05",
  reviewedBy: "owner",
  reviewedAt: "2026-11-07",
  source: "docs/lessons/drafts/L-T4-answer-reason-example-B2.md",
  madeUpNote: "All examples in this lesson are **made up** for teaching. None comes from a real student.",
  why: {
    default: 'Your answer to Question {n} was too short to count: "{evidence quote}". {evaluator note}',
    partial: 'Your answer to Question {n} only touched on the question: "{evidence quote}".',
  },
  explanation: [
    {
      kind: "p",
      text: 'In Part 2, one bare sentence does not count as an answer. "My father gave me advice." or "No, they shouldn\'t." is marked as not answered. An answer that only touches the question counts, but it shows very little.',
    },
    { kind: "p", text: "Build every answer in three steps:" },
    {
      kind: "ol",
      items: [
        "**Answer:** answer the question directly in your first sentence.",
        "**Reason:** say why, with *because*, *since* or *so*.",
        "**Example:** add one detail from your life: when, where, what happened.",
      ],
    },
    {
      kind: "p",
      text: "That takes about 30 seconds per question, which fits two minutes. It also lets you show B2 language: linking words, precise vocabulary and longer sentences. Short on time? Keep the answer and the reason.",
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
    note: "The examples never use the advice topic, so lesson sentences can't be copied into the retry.",
  },
  examples: [
    {
      problem: "Question 1, bare sentence (`minimal`)",
      weaker: "My friend helped me.",
      better: "My best friend helped me last spring, when my laptop broke two days before a big project was due. I had lost almost all my work and didn't know what to do.",
      note: "Answer (who) + situation + a detail of what was happening.",
      madeUp: true,
    },
    {
      problem: "Question 2, bare sentence (`minimal`)",
      weaker: "He lent me his laptop, and I was happy.",
      better: "He lent me his own laptop for the whole weekend, even though he needed it himself, so I could finish on time. I was so grateful that I bought him dinner afterwards.",
      note: "Answer + reason (*so I could…*) + what happened next.",
      madeUp: true,
    },
    {
      problem: "Question 3, bare sentence (`minimal`)",
      weaker: "Yes, less.",
      better:
        "Yes, I think people help each other less than in the past. Life is busier now, so people have less time for their neighbours. For example, my grandparents knew everyone in their street, while I hardly know anyone in my building.",
      note: "Answer + reason + example: the full three steps.",
      madeUp: true,
    },
    {
      problem: "Question 3, touched on but not answered (`partial`)",
      weaker: "People are very busy these days.",
      better:
        "On the whole, I'd say people help each other less face to face, but more in other ways. Everyone is busy, so we rarely visit neighbours, but many people help strangers online, for example by answering questions in forums.",
      note: 'The question asks "do you think…?", so say yes, no or "it depends" first, then the reason.',
      madeUp: true,
    },
  ],
  drill: {
    intro: "Record each prompt, listen back, then tick the checklist. Self-check only, no AI scoring.",
    taskId: "b2-part2-advice-from-someone",
    items: [
      { prompt: "Who gave you advice, and what situation were you in? Answer in one sentence, then add one detail.", seconds: 20 },
      { prompt: 'What was the advice, and did you follow it? Answer, then add "because…".', seconds: 20 },
      { prompt: 'Should young people always follow advice from older people? Answer, give a reason, then start "For example, …".', seconds: 30 },
      { prompt: 'Make this bare answer full: "Yes, I followed it." Add a reason and what happened next.', seconds: 20 },
      { prompt: 'Make this answer direct: "Older people have a lot of experience." Start with your yes / no / it depends.', seconds: 20 },
    ],
    checklist: [
      "My first sentence answered the question directly.",
      "I added a reason (*because*, *since*, *so*).",
      "I added an example or a detail from my own life.",
    ],
  },
  retry: {
    intro: "Same task, same timings: 1 minute preparation, 2 minutes speaking. Scored by the AI as a normal retry.",
    objective: 'Answer question {n} fully: "{question text}"',
    successCheck: "You answer question {n} directly in your first sentence, then add a reason or an example.",
    reminder: "For every question: answer → reason → example.",
  },
};
