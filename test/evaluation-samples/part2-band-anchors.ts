import type { LanguageBand, PartTwoBand, QuestionStatus } from "./part2-band";

/**
 * ANCHOR SET — Part 2 (Question 7), "Technology and young people"
 * (task b2-part2-technology-young-people; its three task points are the
 * anchor questions Q1–Q3).
 *
 * Unlike the loose-range samples in b2-part2-samples.ts, every anchor has an
 * EXACT expected 0–5 band (see part2-band.ts for how the band is derived from
 * the evaluator's per-feature levels and question statuses). Pass criterion:
 * all anchors hit their band exactly (`npm run eval:live`).
 *
 * All responses are SYNTHETIC; they contain no real student data.
 */
export interface BandAnchor {
  id: string;
  description: string;
  /** Why the anchor has this band (the calibration rule it tests). */
  why: string;
  transcript: string;
  durationMs: number;
  expect: {
    band: PartTwoBand;
    /** The judgements that lead to the band; reported on a miss, not asserted separately. */
    language: LanguageBand;
    questions: [QuestionStatus | "on_topic", QuestionStatus | "on_topic", QuestionStatus | "on_topic"];
  };
}

export const PART2_BAND_ANCHORS: BandAnchor[] = [
  {
    id: "A0-below-b1",
    description: "Language below B1 (higher A2 features), list of points.",
    why: 'Systematic basic errors, very basic vocabulary, no real cohesion beyond "also/so". Language below B1 → 0 regardless of coverage.',
    durationMs: 70_000,
    transcript:
      "Technology is good and bad. I use phone every day. I am write message to my friend. Social media is good, you can see photo, video. " +
      "It is bad also, people is lazy, eyes is hurt. Many people play game all day. My brother he play game very much. School phone... I think yes, no phone. " +
      "Because student no listen teacher. Phone is very bad for study. Also phone is good for find information. I like Telegram and Instagram. " +
      "So technology is good and bad. That's all.",
    expect: { band: 0, language: "below_b1", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    id: "A1-b1-one-question",
    description: "B1 language, only Q2 on topic.",
    why: "Simple structures mostly correct, simple linkers, limited vocabulary. Only Q2 answered; Q1 not about communication habits, Q3 absent → B1 + 1 question = 1.",
    durationMs: 90_000,
    transcript:
      "In my opinion, social media has advantages and disadvantages for young people. First, the main advantage is that you can find a lot of information quickly. " +
      "For example, I watch educational videos on YouTube and I learn new words in English. Also, you can follow interesting people and get new ideas. " +
      "But there are also disadvantages. Many young people spend too much time on Instagram and TikTok, and they don't sleep enough. " +
      "Sometimes they see fake news and they believe it. Another problem is that people compare their life with other people's life, and they feel sad. " +
      "I think this is the biggest problem. My favourite app is Telegram because it is fast and I can read news there. " +
      "In conclusion, social media is useful but we must be careful with it.",
    expect: { band: 1, language: "b1", questions: ["not_covered", "on_topic", "not_covered"] },
  },
  {
    id: "A2-b1-all-three",
    description: "B1 language, all three on topic (tests that B1 caps at 2).",
    why: "All three questions answered, but language is B1 (simple structures, simple linkers, limited range) → 2. A 3+ here means B1/B2 calibration is too generous.",
    durationMs: 95_000,
    transcript:
      "I want to talk about technology and young people. Me and my friends use technology every day to communicate. " +
      "We usually write messages on Telegram, and sometimes we make video calls in the evening. I almost never call people with normal phone calls. " +
      "Social media has advantages and disadvantages. The good side is that young people can keep in touch with friends who live far away, and they can learn many things. " +
      "The bad side is that they spend too much time online and they don't do their homework. Some of them become addicted. " +
      "About schools, I think schools should limit smartphones, but not completely. Students shouldn't use phones in lessons because they can't concentrate. " +
      "But in the break time they can use them, because sometimes they need to call their parents. So, technology is useful, but we need to control it.",
    expect: { band: 2, language: "b1", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    id: "A3-b2-q3-missing",
    description: "B2 language, Q3 missing.",
    why: "Some complex structures used accurately, adequate range, clear linking. Q1 and Q2 on topic, Q3 (schools) never addressed → B2 + 2 questions = 3.",
    durationMs: 100_000,
    transcript:
      "When it comes to communication, people my age rely almost entirely on messaging apps. Personally, I'd rather send a voice message than make a phone call, " +
      "because it lets me reply whenever it suits me, and most of my friends feel the same way. Group chats have more or less replaced meeting up to plan things. " +
      "As for social media, the biggest advantage is that it keeps young people connected to friends and communities they would otherwise lose touch with. " +
      "For instance, my cousin moved to Korea two years ago, yet we still talk almost every day. On the other hand, social media can seriously damage self-esteem, " +
      "since teenagers constantly compare their real lives with other people's carefully edited photos. Another drawback is that it's designed to be addictive, " +
      "so it's easy to waste hours scrolling without noticing. Overall, I'd say it depends on how consciously it's used: if young people set limits for themselves, " +
      "the benefits clearly outweigh the risks.",
    expect: { band: 3, language: "b2", questions: ["on_topic", "on_topic", "not_covered"] },
  },
  {
    id: "A4-b2-all-three",
    description: "B2 language, all three on topic.",
    why: "B2 features throughout, a few minor slips at most, limited but effective cohesive devices. All three answered → 4.",
    durationMs: 105_000,
    transcript:
      "To begin with, people my age mostly communicate through messaging apps like Telegram. I tend to send voice messages rather than call, " +
      "since it's quicker and less awkward, and we organise almost everything in group chats. " +
      "When it comes to social media, the main advantage is that it helps young people stay in touch and find people who share their interests. " +
      "For example, I joined an online community of programmers, and it has helped me a lot with my studies. However, there are some serious drawbacks. " +
      "Many teenagers spend hours scrolling, which affects their sleep and concentration, and constant comparison with others can make them feel insecure. " +
      "As for schools, I believe they should limit smartphone use during lessons, because notifications make it almost impossible to focus. " +
      "That said, I don't think a total ban is a good idea, as phones can be useful for research or in an emergency. " +
      "A reasonable compromise would be to keep phones in bags during class but allow them during breaks.",
    expect: { band: 4, language: "b2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    id: "A5-above-b2",
    description: "Above B2 (C1-level), all three on topic.",
    why: "Wide range of accurate complex structures, precise vocabulary, varied cohesive devices, all three questions developed → above B2 = 5.",
    durationMs: 115_000,
    transcript:
      "For my generation, communication has become almost entirely text-based. I'd estimate that most of my conversations happen in group chats, " +
      "and voice notes have largely taken over from phone calls, which many of us find intrusive. Interestingly, we often message each other even when we're in the same room. " +
      "Social media is undeniably a double-edged sword. On the plus side, it gives young people access to communities and opportunities that simply weren't available before; " +
      "a teenager in a small town can now learn from experts worldwide or build an audience for their work. Having said that, the downsides are hard to ignore. " +
      "Platforms are deliberately engineered to maximise screen time, and the endless stream of curated images can quietly erode self-esteem, particularly among teenage girls. " +
      "Whether schools should restrict smartphones is a more nuanced question. I'm broadly in favour of limiting them during lessons, " +
      "since even a phone sitting face-down on a desk has been shown to reduce concentration. Nevertheless, an outright ban seems counterproductive: " +
      "rather than pretending phones don't exist, schools would do better to teach students how to manage them responsibly.",
    expect: { band: 5, language: "above_b2", questions: ["on_topic", "on_topic", "on_topic"] },
  },
  {
    id: "A0-memorized-off-topic",
    description: "Fluent but off-topic / memorized.",
    why: 'Decent language but none of the three questions addressed → 0 (official: "completely off-topic, e.g. memorized answers").',
    durationMs: 45_000,
    transcript:
      "I would like to talk about my hometown. My hometown is Samarkand, which is one of the oldest cities in Central Asia. " +
      "It is famous for its beautiful architecture, especially the Registan Square. Many tourists visit it every year. " +
      "The people are very friendly and hospitable, and the food is delicious, especially plov. " +
      "In the future I want to work there and help develop tourism.",
    expect: { band: 0, language: "b1", questions: ["not_covered", "not_covered", "not_covered"] },
  },
];
