import type { LicensedImage, SpeakingTask } from "@/domain/speaking/task";
import { PART1_QUESTION_AUDIO, part1AudioDir } from "./question-audio";

/**
 * Part 1.2 tasks made from the teacher's list (part1-2-bank.ts), each with our own two pictures (public/tasks/part1/,
 * CEFRO's original illustrations, 2026-11-21). Same shape, timings and wording rules as b1-part1-2-shopping.ts:
 * Question 4 is the exam's own "What can you see in these pictures?", Questions 5 and 6 are the list's (after its fixes).
 * Left out of the bank on purpose: "supermarket-or-open-air-market" (same topic as b1-part1-2-shopping) and
 * "car-or-public-transport" (too close to the official sample's "walking over driving", decision 9).
 */

/** Spoken before Question 4 (our own wording, the same for every Part 1.2 task), then the sample chime. */
const INTRO = "Part 1.2. Now you will look at two pictures and answer three questions about them. Start speaking when you hear this sound.";
const QUESTION_4 = "What can you see in these pictures?";

const INSTRUCTIONS = [
  "You will see two pictures and hear three questions about them, one after another.",
  "After each question you have time to get ready: 10 seconds for the first, 5 seconds for the others.",
  "Then you hear a chime: start speaking. You have 45 seconds for the first answer and 30 seconds for the others. A chime also tells you when the time is up.",
  "The next question starts automatically.",
  "Headphones are recommended.",
];

const CEFRO_PICTURE = {
  width: 480,
  height: 360,
  author: "CEFRO (original illustration, 2026; not based on any existing image)",
  licence: "© 2026 CEFRO. All rights reserved.",
  retrievedAt: "2026-11-21",
} as const;

function picture(file: string, alt: string): LicensedImage {
  return { ...CEFRO_PICTURE, src: `/tasks/part1/${file}`, sourceUrl: `public/tasks/part1/${file}`, alt };
}

interface Part12Spec {
  slug: string;
  title: string;
  topic: string;
  /** Questions 5 and 6. */
  questions: [string, string];
  images: [LicensedImage, LicensedImage];
  /** What each picture shows, and what answers Questions 5 and 6 (for the evaluator only). */
  guidance: { pictureA: string; pictureB: string; contrasts: string; q5: string; q6: string; vocabulary: string };
}

function part12Task(spec: Part12Spec): SpeakingTask {
  const id = `b1-part1-2-${spec.slug}`;
  const audio = part1AudioDir(id, 1);
  const prompts = [QUESTION_4, ...spec.questions];
  const g = spec.guidance;
  return {
    id,
    version: 1,
    level: "B1",
    part: 1,
    taskType: "picture_questions",
    rubricId: "multilevel-q4-6",
    title: spec.title,
    topic: spec.topic,
    question: "Look at the two pictures and answer three questions about them.",
    prompts,
    images: spec.images,
    instructions: INSTRUCTIONS,
    preparationSeconds: 0,
    speakingSeconds: 105,
    delivery: {
      firstQuestionNumber: 4,
      intro: { text: INTRO, audio: `${audio}/intro.wav` },
      questions: [
        { text: prompts[0]!, audio: `${audio}/q4.wav`, prepSeconds: 10, speakingSeconds: 45, partialHint: "talk about both pictures" },
        { text: prompts[1]!, audio: `${audio}/q5.wav`, prepSeconds: 5, speakingSeconds: 30 },
        { text: prompts[2]!, audio: `${audio}/q6.wav`, prepSeconds: 5, speakingSeconds: 30 },
      ],
      audioSource: PART1_QUESTION_AUDIO,
    },
    evaluatorGuidance: [
      `Picture A shows ${g.pictureA}`,
      `Picture B shows ${g.pictureB}`,
      `Question 4 (the student's first question, '${QUESTION_4}') is on topic when the student describes BOTH pictures. Comparing them is welcome and is good evidence for language and cohesion, but it is not needed for on topic: ${g.contrasts}`,
      "Question 4 is partial when the student describes only one picture.",
      `Question 5 asks ${g.q5}`,
      `Question 6 asks ${g.q6}`,
      "A bare one-sentence answer with no reason or detail (e.g. 'Because it is good.') is partial in Part 1.2: it counts, but the feedback asks for a reason or detail.",
      `Typical vocabulary at B1: ${g.vocabulary}`,
    ].join("\n"),
  };
}

export const b1Part12Sports = part12Task({
  slug: "indoor-outdoor-sports",
  title: "Sport outside or in a gym",
  topic: "Sport",
  questions: ["What are the advantages of indoor sports?", "Do you prefer outdoor sports or indoor sports?"],
  images: [
    picture(
      "outdoor-running.svg",
      "Outdoors in the countryside: a young man in a red T-shirt and shorts runs along a winding path between green hills and trees on a sunny day.",
    ),
    picture(
      "indoor-gym.svg",
      "Inside a bright gym: a row of running machines in front of big windows. A young woman in sports clothes with a towel round her neck stands next to one of them, holding a water bottle.",
    ),
  ],
  guidance: {
    pictureA: "a young man running on a country path between green hills and trees, outdoors on a sunny day.",
    pictureB: "a young woman in sports clothes with a towel and a water bottle in a gym, next to a row of running machines.",
    contrasts: "outdoors vs indoors, nature and fresh air vs machines, a path vs a running machine, sunny weather vs a room.",
    q5: "about the advantages of indoor sports (e.g. no rain, snow or heat, open all year, machines and equipment, a trainer, safe, near home or work).",
    q6: "for the student's own preference, outdoor or indoor, with a reason. Either choice is on topic; 'I like both' with reasons is on topic too.",
    vocabulary: "fresh air, nature, weather, equipment, gym, running machine, healthy, fit, trainer, membership, outdoors, indoors.",
  },
});

export const b1Part12PlaneOrTrain = part12Task({
  slug: "plane-or-train",
  title: "By plane or by train",
  topic: "Travel",
  questions: ["What are the advantages of travelling by plane?", "Why do some people prefer travelling by train?"],
  images: [
    picture(
      "plane-window.svg",
      "Inside a plane: a woman sits in a window seat under the luggage lockers and looks out of a small round window at white clouds and the tip of the wing.",
    ),
    picture(
      "train-window.svg",
      "Inside a train: a young man sits at a small table with a cup of tea and looks out of a large window at green hills, trees and a river going past.",
    ),
  ],
  guidance: {
    pictureA: "a woman in a window seat inside a plane, looking out of a small round window at clouds and the wing.",
    pictureB: "a young man at a table inside a train with a cup of tea, looking out of a big window at green hills, trees and a river.",
    contrasts: "in the sky vs on the ground, clouds vs hills and a river, a small window vs a big one, a narrow seat vs a table.",
    q5: "about the advantages of flying (e.g. fast, long distances, other countries, saves time, comfortable on long trips).",
    q6: "why some people prefer trains (e.g. the view, cheaper, more space, can walk around, stations in the city centre, no airport checks, afraid of flying, better for the environment).",
    vocabulary: "fast, comfortable, ticket, seat, view, journey, airport, station, delay, cheap, expensive, environment.",
  },
});

export const b1Part12HealthyOrFastFood = part12Task({
  slug: "healthy-or-fast-food",
  title: "Healthy food or fast food",
  topic: "Food",
  questions: ["Why do many people try to eat healthy food?", "Why do some people choose fast food?"],
  images: [
    picture(
      "healthy-salad.svg",
      "At home in a bright kitchen: a young woman sits at a table with a big bowl of fresh salad (green leaves, tomatoes, cucumber) and a glass of water. A plant stands on the table.",
    ),
    picture(
      "fast-food.svg",
      "In a fast-food café: three young friends sit side by side at a table with burgers, boxes of chips and big paper cups of drink with straws. One of them holds a burger.",
    ),
  ],
  guidance: {
    pictureA: "a young woman at home with a big bowl of fresh salad and a glass of water.",
    pictureB: "three young friends in a fast-food café with burgers, chips and paper cups of drink.",
    contrasts: "alone vs with friends, at home vs in a café, salad and water vs burgers, chips and sweet drinks, fresh vs fried.",
    q5: "why people try to eat healthily (e.g. health, energy, weight, doctors' advice, sport, living longer, looking good).",
    q6: "why some people choose fast food (e.g. quick, cheap, tasty, no time to cook, open late, eating with friends).",
    vocabulary: "healthy, fresh, vegetables, vitamins, fried, fat, sugar, quick, tasty, cheap, cook, diet.",
  },
});

export const b1Part12OnlineOrClassroom = part12Task({
  slug: "online-or-classroom",
  title: "Learning online or in class",
  topic: "Education",
  questions: ["What are the advantages of online learning?", "Why do some students prefer studying in a classroom?"],
  images: [
    picture(
      "classroom-tablets.svg",
      "In a classroom: two students sit at their desks in front of a green board, each working on a tablet. A wall clock hangs above the board.",
    ),
    picture(
      "home-laptop.svg",
      "At home in his room: a young man sits alone at a desk with a laptop and headphones round his neck, next to a desk lamp and a mug. A bookshelf and a window are behind him.",
    ),
  ],
  guidance: {
    pictureA: "two students at desks in a classroom in front of a board, each working on a tablet.",
    pictureB: "a young man alone at home at a desk with a laptop and headphones, a lamp and a mug.",
    contrasts: "at school vs at home, with other students vs alone, tablets vs a laptop, a board and a clock vs a bookshelf and a lamp.",
    q5: "about the advantages of online learning (e.g. study at home, no travel, choose your own time, watch lessons again, cheaper, courses from other countries).",
    q6: "why some students prefer a classroom (e.g. a teacher to ask, friends, discipline and a timetable, fewer distractions, speaking practice, better internet at school).",
    vocabulary: "teacher, classmates, lesson, online, internet, laptop, timetable, concentrate, distract, travel, flexible, practice.",
  },
});

export const b1Part12BoardGamesOrTv = part12Task({
  slug: "board-games-or-tv",
  title: "Board games or TV",
  topic: "Free time",
  questions: [
    "What are the advantages of playing board games instead of watching TV?",
    "What are the advantages of watching TV over playing board games?",
  ],
  images: [
    picture(
      "tv-family.svg",
      "In a living room, seen from behind: a mother, a father and a child sit on a sofa watching a big TV on the wall, which shows a picture of mountains. A lamp stands beside the TV.",
    ),
    picture(
      "board-game.svg",
      "Three friends sit round a table playing a board game with coloured squares, small playing pieces and two dice. The friend in the middle raises a hand to throw the dice.",
    ),
  ],
  guidance: {
    pictureA: "a family (mother, father, child) on a sofa, seen from behind, watching a big TV on the wall.",
    pictureB: "three friends round a table playing a board game with coloured squares, pieces and dice; one raises a hand to throw the dice.",
    contrasts: "watching vs playing, sitting quietly vs talking and moving, a screen vs a board and dice, a family vs friends.",
    q5: "about the advantages of board games over TV (e.g. talking to each other, thinking and planning, no screen, fun together, learning to win and lose).",
    q6: "about the advantages of TV over board games (e.g. relaxing after work, news and information, films, no need for other people, learning English, easy).",
    vocabulary: "together, talk, think, relax, screen, programme, news, film, rules, dice, win, lose.",
  },
});

/** The new Part 1.2 tasks, in the order the task list shows them (after b1-part1-2-shopping). */
export const PART12_NEW_TASKS: readonly SpeakingTask[] = [
  b1Part12Sports,
  b1Part12PlaneOrTrain,
  b1Part12HealthyOrFastFood,
  b1Part12OnlineOrClassroom,
  b1Part12BoardGamesOrTv,
];
