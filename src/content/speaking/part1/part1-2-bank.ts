/**
 * Part 1.2 question bank: DATA ONLY. No page, mock or evaluator reads this file. Five entries are now real tasks with
 * our own pictures (part1-2-tasks.ts, 2026-11-21): indoor-outdoor-sports, plane-or-train, healthy-or-fast-food,
 * online-or-classroom and board-games-or-tv. The rest still need their pictures.
 *
 * Source: a teacher's "Part 1.2 full list" (owner upload, 2026-11-15, /mnt/project-files/uzbmb/teacher-lists/
 * part1.2-list-1.jpg … part1.2-list-5.jpg). Each page shows TWO tasks (two pictures + three questions each); they are
 * split here into one entry per task, as the owner asked. Question 4 is always the exam's "What can you see in these pictures?". Wording is the list's (owner's Part 1 decision), with obvious
 * errors fixed and each fix recorded in `fixes`.
 *
 * The pictures on those pages are stock / AI images from a teacher's channel: they are NOT copied. Each entry says what
 * its two pictures must show, so we can make our own. An entry becomes a real task (like b1-part1-2-shopping.ts) only
 * when its own two pictures exist, with the licence fields every Part 1.2 picture needs (docs/part1-question-bank.md).
 */

export interface Part12BankEntry {
  /** Our id, used when the entry becomes a task (`b1-part1-2-<slug>`). */
  slug: string;
  theme: string;
  /** Questions 4, 5 and 6, as on the list (after `fixes`). */
  questions: [string, string, string];
  /** What each of our two pictures must show (a contrast, like the list's). */
  pictures: [string, string];
  /** Which page and which half of it (the list's own image). */
  source: string;
  /** Corrections made to the list's wording: [as on the list, as here]. */
  fixes?: [string, string][];
  /** Something to decide before it becomes a task. */
  note?: string;
}

export const PART12_BANK: readonly Part12BankEntry[] = [
  {
    slug: "indoor-outdoor-sports",
    theme: "Outdoor sports vs indoor sports",
    questions: ["What can you see in these pictures?", "What are the advantages of indoor sports?", "Do you prefer outdoor sports or indoor sports?"],
    pictures: ["A young person running outside on a path in the countryside.", "A young person at an indoor gym, next to running machines."],
    source: "part1.2-list-1 (IMG_4029), top",
  },
  {
    slug: "plane-or-train",
    theme: "Travelling by plane vs by train",
    questions: ["What can you see in these pictures?", "What are the advantages of travelling by plane?", "Why do some people prefer travelling by train?"],
    pictures: ["A passenger by the window inside a plane.", "A passenger looking out of the window of a train going through green hills."],
    source: "part1.2-list-1 (IMG_4029), bottom",
  },
  {
    slug: "supermarket-or-open-air-market",
    theme: "Supermarket vs open-air market",
    questions: ["What can you see in these pictures?", "What are the advantages of shopping at a supermarket?", "Why do some people prefer shopping at an open-air market?"],
    pictures: ["A family shopping with a trolley between supermarket shelves.", "A shopper choosing vegetables at an open-air market stall."],
    source: "part1.2-list-2 (IMG_4030), top",
    note: "Same topic as our existing Part 1.2 task b1-part1-2-shopping (local market vs supermarket). Use one or the other, not both: a student would get the same task twice.",
  },
  {
    slug: "healthy-or-fast-food",
    theme: "Healthy food vs fast food",
    questions: ["What can you see in these pictures?", "Why do many people try to eat healthy food?", "Why do some people choose fast food?"],
    pictures: ["A young person eating a bowl of salad at home.", "A group of friends eating burgers and chips together."],
    source: "part1.2-list-2 (IMG_4030), bottom",
  },
  {
    slug: "online-or-classroom",
    theme: "Online learning vs studying in a classroom",
    questions: ["What can you see in these pictures?", "What are the advantages of online learning?", "Why do some students prefer studying in a classroom?"],
    pictures: ["Students with tablets at desks in a classroom.", "A person studying alone at home with a laptop."],
    source: "part1.2-list-3 (IMG_4031), top",
    note:
      "The bottom half of the same page repeats these questions ('…some people prefer…') under two pictures about eating (friends eating out in a café, a family eating at home) that do not match them. Treated as a mistake on the list and left out. It may have meant an 'eating out vs eating at home' task, but its questions are not on the list.",
  },
  {
    slug: "board-games-or-tv",
    theme: "Board games vs watching TV",
    questions: [
      "What can you see in these pictures?",
      "What are the advantages of playing board games instead of watching TV?",
      "What are the advantages of watching TV over playing board games?",
    ],
    pictures: ["A family on a sofa watching TV together.", "Friends playing a board game at a table."],
    source: "part1.2-list-4 (IMG_4032), top",
    fixes: [["…watching TV over playing games?", "…watching TV over playing board games?"]],
  },
  {
    slug: "car-or-public-transport",
    theme: "Private car vs public transport",
    questions: ["What can you see in these pictures?", "Why do some people prefer using private cars?", "Why do others choose public transport?"],
    pictures: ["A person driving their own car.", "People standing and sitting on a busy city bus."],
    source: "part1.2-list-4 (IMG_4032), bottom",
  },
  {
    slug: "grow-or-buy-vegetables",
    theme: "Growing your own vegetables vs buying them in a supermarket",
    questions: [
      "What can you see in these pictures?",
      "What are the advantages of growing vegetables at home?",
      "Why do some people think that vegetables in a supermarket are better?",
    ],
    pictures: ["A person looking after vegetables they grow in a greenhouse or garden.", "A shopper choosing vegetables from supermarket shelves."],
    source: "part1.2-list-5 (IMG_4033), top",
    fixes: [
      ["What do you see in these pictures?", "What can you see in these pictures?"],
      ["…growing veges at home?", "…growing vegetables at home?"],
      ["Why do some people think that vegetables in a supermarket?", "Why do some people think that vegetables in a supermarket are better?"],
    ],
  },
  {
    slug: "festivals-or-museums",
    theme: "Traditional holidays vs visiting museums",
    questions: ["What can you see in these pictures?", "Are traditional holidays better than visiting museums?", "Why do some people think that museums are boring?"],
    pictures: ["A crowded street festival or holiday parade.", "A person looking at paintings in a quiet museum."],
    source: "part1.2-list-5 (IMG_4033), bottom",
    fixes: [["What do you see in these pictures? (no number on the list)", "What can you see in these pictures?"]],
    note: "Our pictures should show a holiday that feels local (for example Navruz celebrations), not the list's Chinese New Year parade.",
  },
];
