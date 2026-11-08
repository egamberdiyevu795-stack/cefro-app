import type { BandAnchor } from "./part2-band-anchors";

/**
 * ANCHOR ANSWERS — the six newer Part 2 tasks (2 per task).
 *
 * Same format as the "Advice from someone" anchors (`part2-band-anchors.ts`): each has an EXACT expected 0–5 band,
 * the band the evaluator computes from its per-feature levels and question statuses. Per task:
 *   - one band 4 (Higher B2): B2 language, all three questions on topic;
 *   - one band 1 (Lower B1): B1 language, exactly one question on topic (either only the general question 3, or only
 *     question 1 with an ending that is still about the student's own story, the question 3 trap).
 *
 * STATUS: NOT YET LIVE-TESTED. These were written by hand and have never been scored by the live evaluator (no Gemini
 * call was made for them). They are wired into the live evaluation set (`npm run eval:live`; only these:
 * `npm run eval:live:new-tasks`, each answer sent with its own task; `-- --dry-run` prints what would be sent and the
 * estimated cost, calling nothing). The unit test only checks that the expected judgements give the expected band
 * under the official scoring, and that the pipeline accepts them with the development evaluator. Run them live before
 * relying on them for calibration.
 *
 * All responses are SYNTHETIC; they contain no real student data.
 */
export const NOT_YET_LIVE_TESTED = "not yet live-tested" as const;

export interface NewTaskBandAnchor extends BandAnchor {
  taskId: string;
  liveStatus: typeof NOT_YET_LIVE_TESTED;
}

export const PART2_NEW_TASK_ANCHORS: NewTaskBandAnchor[] = [
  /* ── An important decision ─────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-important-decision",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "D4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "Says what the decision was and when (Q1), why and how it changed his life (Q2), and gives a general view on deciding alone or with help (Q3). Past perfect, relative clauses, conditionals, clear linking → B2 + 3 questions = 4.",
    durationMs: 112_000,
    transcript:
      "I'd like to talk about a decision I made about two years ago, when I was in my last year at school. " +
      "I had been offered a place at a university in Tashkent, but I had also been accepted onto a two-year programming course in my home town, " +
      "which was much cheaper and closer to my family. After weighing up the pros and cons for several weeks, I decided to take the course instead. " +
      "The main reason was that I wanted to start working as soon as possible, so that I could support my parents, who had been struggling financially. " +
      "Looking back, it was a real turning point. Within a year I had found a part-time job as a junior developer, and I became much more independent and confident. " +
      "As for whether it's better to make big decisions alone or to ask others for help, I think people should ask for advice, but the final decision should be their own. " +
      "Other people can point out risks that you haven't noticed, especially if they have more experience. " +
      "However, if someone else makes the decision for you, you won't feel responsible for it, and you may regret it later.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-important-decision",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "D1-b1-only-q3",
    description: "B1 language, only Q3 on topic.",
    why: "Never describes a decision of her own, so Q1 and Q2 are missing; gives a general view on asking others for help (Q3). Simple structures and linkers → B1 + 1 question = 1.",
    durationMs: 84_000,
    transcript:
      "I think decisions are very important in life. Every day we make many decisions, small and big. " +
      "For example, what to study, which job to choose, or where to live. " +
      "In my opinion, it is better to ask other people for help when the decision is big, because parents and friends have more experience, " +
      "and they can see problems which we cannot see. But sometimes other people want different things for us, so we must also think ourselves. " +
      "In Uzbekistan many young people ask their parents about everything, and I think it is good, but not always. " +
      "So my opinion is: ask others, but decide yourself. Big decisions are difficult for everybody.",
    expect: { band: 1, language: "B1", questions: ["missing", "missing", "on_topic"] },
  },

  /* ── A goal you set ────────────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-goal-you-set",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "G4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "The goal and why (Q1), what she did and that she succeeded (Q2), and general reasons why some people never reach their goals (Q3). Past perfect, relative clauses, varied linking → B2 + 3 questions = 4.",
    durationMs: 116_000,
    transcript:
      "One goal I set myself last year was to run a half marathon. I chose it because I had been spending far too much time sitting at my desk, " +
      "and my doctor had warned me that my lack of exercise could cause problems later on. " +
      "To reach it, I followed a sixteen-week training plan that I found online, running four times a week and gradually increasing the distance. " +
      "There were weeks when I nearly gave up, particularly in winter, when it was dark and freezing in the mornings, " +
      "but a friend agreed to train with me, which kept me motivated. In the end I finished the race in just under two hours, and I was incredibly proud of myself. " +
      "As for why some people never reach their goals, I think there are a few reasons. " +
      "Firstly, many people set goals that are far too ambitious, so they lose motivation when they don't see quick results. " +
      "Secondly, a lot of people have a goal but no clear plan, which means they don't know what to do each day. " +
      "Finally, some people give up after their first failure instead of treating it as part of the process.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-goal-you-set",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "G1-b1-only-q1",
    description: "B1 language, only Q1 on topic; the ending is still about the student's own goal.",
    why: "Says what the goal was and why (Q1), but never what he did to reach it or whether he succeeded (Q2 missing), and the ending is about himself, not why some people never reach their goals (Q3 missing) → B1 + 1 question = 1.",
    durationMs: 80_000,
    transcript:
      "My goal was to learn English well. I chose this goal because I want to study in another country, maybe in Korea or in England. " +
      "Also English is important for a good job in Uzbekistan. My family also wants me to know English. " +
      "My father always says English is the language of the future. I like English films and music too, so this goal is interesting for me. " +
      "English is a very useful language, and many people in the world speak it. I think it is a good goal for me. " +
      "I am a hard-working person, and I like to learn new things. My friends also want to learn English. " +
      "I hope one day I will speak like a native speaker.",
    expect: { band: 1, language: "B1", questions: ["on_topic", "missing", "missing"] },
  },

  /* ── Working in a team ─────────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-working-in-a-team",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "T4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "The task and who was in the team (Q1), her role and how the team did (Q2), and a general view on working alone or in a team (Q3). Passives, relative clauses, contrast linkers → B2 + 3 questions = 4.",
    durationMs: 115_000,
    transcript:
      "I'd like to describe a time when I worked in a team at university. In our second year, our economics teacher asked us to prepare a market research project " +
      "about a new café opening near the campus, and I was put in a group with three classmates I hardly knew. " +
      "My role was to design the questionnaire and analyse the results, while the others were responsible for interviewing customers and preparing the presentation. " +
      "At first things didn't go smoothly, because two of us wanted to take the lead and we kept disagreeing about the deadlines. " +
      "However, once we divided the tasks clearly and agreed to meet twice a week, we started to rely on each other, and in the end we got the highest mark in the class. " +
      "As for whether people achieve more working alone or in a team, I believe teams usually achieve more, especially on big or complicated tasks. " +
      "Each person brings different skills, so the group can cover more than one person could. " +
      "That said, teamwork only works if responsibilities are clear; otherwise a few people end up doing everything, and it can be less productive than working alone.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-working-in-a-team",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "T1-b1-only-q3",
    description: "B1 language, only Q3 on topic.",
    why: "Talks about teamwork in general and never describes a time he worked in a team (Q1 and Q2 missing); gives a general view on alone or in a team (Q3) → B1 + 1 question = 1.",
    durationMs: 82_000,
    transcript:
      "Teamwork is a very popular topic today. Many companies want workers who can work in a team. " +
      "In my opinion, people achieve more in a team, because when many people work together, they can share the work and finish it faster. " +
      "Also every person has different ideas, and together the ideas are better. " +
      "But some people like to work alone, because in a team there are sometimes problems and arguments. " +
      "And some people in a team are lazy, and other people do all the work. So I think it depends on the person and the job. " +
      "For example, a writer can work alone, but a football player needs a team. In general, I think a team is better for most jobs.",
    expect: { band: 1, language: "B1", questions: ["missing", "missing", "on_topic"] },
  },

  /* ── Trying and failing ────────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-trying-and-failing",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "F4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "What he tried to do and why (Q1), what went wrong and how he felt (Q2), and a general view on whether failure is useful for young people (Q3). Past perfect, relative clauses, 'as long as', 'ended up' → B2 + 3 questions = 4.",
    durationMs: 117_000,
    transcript:
      "I'd like to talk about a time I tried to start my own small business when I was seventeen. " +
      "I had noticed that a lot of students at my school wanted cheap second-hand textbooks, so I decided to buy old books from graduates and resell them online. " +
      "I wanted to earn some pocket money and, to be honest, to prove to my parents that I could be independent. " +
      "Unfortunately, it went wrong quite quickly. I bought far too many books before checking which ones were actually needed, " +
      "and when the new school year started, the syllabus had changed, so nobody wanted most of them. " +
      "I ended up losing nearly all of my savings, and I felt embarrassed, because I had told everyone how successful it would be. " +
      "As for whether failure can be useful for young people, I'm convinced it can, as long as it isn't too serious. " +
      "When you're young, the consequences of a mistake are usually smaller, so it's a relatively safe time to learn from them. " +
      "Failing also teaches people to plan more carefully and to cope with disappointment, which is something you can't really learn from books.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-trying-and-failing",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "F1-b1-only-q1",
    description: "B1 language, only Q1 on topic; the rest drifts to her cousin.",
    why: "Says what she was trying to do and why (Q1), but never what went wrong or how she felt (Q2 missing), and gives no view about failure and young people (Q3 missing) → B1 + 1 question = 1.",
    durationMs: 86_000,
    transcript:
      "I want to talk about when I tried to get into a sports school. I was twelve years old. " +
      "I wanted to be a swimmer, because my cousin is a swimmer and he won many competitions. I wanted to be famous like him. " +
      "Also swimming is a healthy sport, and my doctor said swimming is good for my back. " +
      "My mother found the sports school in our city. It is a big school with a big swimming pool, and many children go there. " +
      "My cousin trained in this school too, and his coach was very famous. Now my cousin lives in Tashkent and he is a coach too. " +
      "He has many students. I visit him every summer, and we go to the swimming pool together. I like the summer very much.",
    expect: { band: 1, language: "B1", questions: ["on_topic", "missing", "missing"] },
  },

  /* ── A tradition ───────────────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-a-tradition",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "R4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "The tradition and when it happens (Q1), how her family takes part and what she enjoys (Q2), and a general view on young people keeping old traditions (Q3). Passives, relative clauses, contrast → B2 + 3 questions = 4.",
    durationMs: 118_000,
    transcript:
      "I'd like to talk about Navruz, which is one of the most important traditions in my country. " +
      "It's the celebration of the new year in spring, and it takes place every year on the twenty-first of March, when day and night are the same length. " +
      "In my family, the preparations start a few days earlier. My grandmother is in charge of making sumalak, a sweet dish made from wheat, " +
      "which has to be stirred all night in a huge pot. Our neighbours usually join us, and everyone takes turns stirring while we chat, sing and tell stories until morning. " +
      "What I enjoy most is that atmosphere, because it's the only night of the year when three generations of my family stay awake together. " +
      "As for whether young people should keep old traditions in the modern world, I strongly believe they should, although traditions can change a little over time. " +
      "They connect us to our history and bring families together, which is especially valuable now, when many people spend more time on their phones than with their relatives. " +
      "However, I don't think young people should follow traditions that are harmful or extremely expensive simply because they are old.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-a-tradition",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "R1-b1-only-q3",
    description: "B1 language, only Q3 on topic.",
    why: "Never names a tradition of her own family or country or says how her family takes part (Q1 and Q2 missing); gives a general view on young people and old traditions (Q3) → B1 + 1 question = 1.",
    durationMs: 83_000,
    transcript:
      "Traditions are very important for every country. Every country has its own traditions, for example holidays, food, music and clothes. " +
      "Today the world is changing very fast. Young people use the internet and social networks, and they like modern things. " +
      "Some young people think old traditions are boring. But in my opinion, young people should keep old traditions, " +
      "because traditions show our history and our culture. If we forget our traditions, we forget who we are. " +
      "Also traditions help families to be together. But maybe some traditions are too old and not good for modern life, " +
      "for example very big and expensive weddings. So we can change some traditions a little. In general, I think traditions are good and we must keep them.",
    expect: { band: 1, language: "B1", questions: ["missing", "missing", "on_topic"] },
  },

  /* ── A happy day ───────────────────────────────────────────────────────────────────────────────────────────── */
  {
    taskId: "b2-part2-happy-day",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "H4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "When, where and who with (Q1), what made him so happy (Q2), and a general view on money and happiness (Q3). Past perfect, cleft-like 'What made me…', 'bound to', concession → B2 + 3 questions = 4.",
    durationMs: 116_000,
    transcript:
      "One of the happiest days of my life was the day my older sister got married, which was last summer in our village near Samarkand. " +
      "Almost all of our relatives were there, including my uncle's family, who had flown in from Russia, and I hadn't seen my cousins for nearly six years. " +
      "What made me so happy wasn't just the wedding itself, although the music and the food were wonderful. " +
      "It was the feeling that the whole family was finally together in one place. " +
      "In the evening my cousins and I sat outside until late, laughing about things we had done as children, and I remember thinking that I'd never felt so relaxed. " +
      "As for whether money makes people happier, I'd say it does, but only up to a point. " +
      "If people can't afford food, housing or medical treatment, they're bound to be stressed, so having enough money definitely improves their lives. " +
      "However, once those basic needs are met, more money doesn't seem to make much difference. " +
      "Many wealthy people are still lonely or anxious, because happiness depends much more on relationships and health than on how much you earn.",
    expect: { band: 4, language: "B2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    taskId: "b2-part2-happy-day",
    liveStatus: NOT_YET_LIVE_TESTED,
    id: "H1-b1-only-q3",
    description: "B1 language, only Q3 on topic.",
    why: "Talks about happiness and money in general and never describes a happy day of his own (Q1 and Q2 missing); gives a general view on whether money makes people happier (Q3) → B1 + 1 question = 1.",
    durationMs: 81_000,
    transcript:
      "Happiness is different for every person. Some people are happy when they have a lot of money, and some people are happy with their family. " +
      "I think money is important, because we need money for food, for a house and for education. " +
      "If a person has no money, he cannot be happy, because he worries every day. But a lot of money can also make problems. " +
      "Rich people sometimes have no time for their family, and they are always busy with work. Also some rich people are not happy, we can see it in the news. " +
      "So, in my opinion, money makes people happier only a little. Health and family are more important than money. I think this is true for everybody.",
    expect: { band: 1, language: "B1", questions: ["missing", "missing", "on_topic"] },
  },
];
