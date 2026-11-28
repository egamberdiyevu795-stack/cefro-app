import type { FeatureLevel, QuestionStatus } from "@/domain/evaluation/multilevel/levels";

/**
 * Part 1 anchor answers (docs/part1-plan.md §4): made-up answers (no real student data) with the judgements we
 * expect from the model and the band the code must compute from them. TEST-ONLY: never imported by app code and never
 * in a prompt (checked by part1-anchors.test.ts). Pronunciation is not assessed (transcript only), so each result is
 * provisional and the mean uses grammar, vocabulary, fluency (+ cohesion in 1.2).
 *
 * The answers must fit the task they are scored against: 1.1 = a2-part1-1-daily-life, 1.2 = b1-part1-2-shopping.
 * (Until 15 Nov 2026 the 1.2 answers were about home cooking vs fast food, a topic with no task; the first live call
 * scored them against the shopping task and correctly found them off topic: band 0 after 162 s.)
 */
export interface Part1Anchor {
  id: string;
  part: "1.1" | "1.2";
  /** One answer per question, in order. */
  answers: [string, string, string];
  statuses: [QuestionStatus, QuestionStatus, QuestionStatus];
  levels: { grammar: FeatureLevel; vocabulary: FeatureLevel; fluency: FeatureLevel; cohesion?: FeatureLevel };
  band: number;
  label: string;
  /** The biggest fix the scorer should name. */
  fix: { kind: "question_coverage"; question_id: number } | { kind: "feature"; feature: "grammar" | "vocabulary" | "fluency" | "cohesion" };
  meetsTarget: boolean;
}

export const PART1_ANCHORS: readonly Part1Anchor[] = [
  {
    id: "1.1-low",
    part: "1.1",
    answers: [
      "Weekend… um… I sleep. I sleep and… television. Yes.",
      "Um… sorry. Um… next, please.",
      "Family is… um… my city is Samarkand. Is big city.",
    ],
    statuses: ["on_topic", "missing", "off_topic"],
    levels: { grammar: "A1", vocabulary: "A1", fluency: "A2" },
    band: 1,
    label: "Lower A1",
    fix: { kind: "question_coverage", question_id: 2 },
    meetsTarget: false,
  },
  {
    id: "1.1-middle",
    part: "1.1",
    answers: [
      "At weekend I usually go bazaar with my mother. Then we cooking plov. In evening I watching film.",
      "My favourite food is manti. I like because is very tasty and my grandmother make every Sunday.",
      "Um… I like football. I play football with my friends in the school. Is very interesting.",
    ],
    statuses: ["on_topic", "on_topic", "off_topic"],
    levels: { grammar: "A2", vocabulary: "A2", fluency: "A2" },
    band: 3,
    label: "Lower A2",
    fix: { kind: "question_coverage", question_id: 3 },
    meetsTarget: true,
  },
  {
    id: "1.1-high",
    part: "1.1",
    answers: [
      "Usually I spend Saturday with my friends. We go to the park or, if the weather is bad, we play games at my friend's house. On Sunday I help my parents at home.",
      "I really love lagman, especially the one my father makes. It's spicy and filling, and I've eaten it since I was a child, so it reminds me of home.",
      "Probably my younger sister. We share a room, so we talk a lot, and I help her with her English homework, although sometimes she's lazy.",
    ],
    statuses: ["on_topic", "on_topic", "on_topic"],
    levels: { grammar: "above_A2", vocabulary: "above_A2", fluency: "above_A2" },
    band: 5,
    label: "Above A2",
    fix: { kind: "feature", feature: "vocabulary" },
    meetsTarget: true,
  },
  {
    id: "1.2-low",
    part: "1.2",
    answers: [
      "In first picture is a market. A man selling vegetable outside. Second picture, big supermarket, a man with trolley. First is outside, second is inside.",
      "Um… sorry, I don't understand. Um…",
      "Um… I don't know. Sorry.",
    ],
    statuses: ["on_topic", "missing", "missing"],
    levels: { grammar: "A2", vocabulary: "A2", fluency: "A2", cohesion: "A2" },
    band: 1,
    label: "Lower A2",
    fix: { kind: "question_coverage", question_id: 2 },
    meetsTarget: false,
  },
  {
    id: "1.2-middle",
    part: "1.2",
    answers: [
      "In the first picture there is a small market where a man is selling fruit and vegetables outside. In the second picture a man is pushing a trolley in a big supermarket. The first one looks more friendly, but the second is bigger.",
      "People like market because the vegetables is more fresh and the price is cheaper. Also my mother know the seller and she talk with him.",
      "Supermarket is big and have everything in one place. People go there with car and buy many thing for all week.",
    ],
    statuses: ["on_topic", "on_topic", "on_topic"],
    levels: { grammar: "A2", vocabulary: "A2", fluency: "B1", cohesion: "B1" },
    band: 2,
    label: "Higher A2",
    fix: { kind: "feature", feature: "vocabulary" },
    meetsTarget: false,
  },
  {
    id: "1.2-high",
    part: "1.2",
    answers: [
      "Both pictures show places to buy food, but they feel very different. The first is a small open-air market, where a seller is chatting with a customer, which looks friendly and personal. The second is a huge supermarket, so it's probably faster but far less personal.",
      "I think people love local markets because the fruit and vegetables are fresher and often cheaper. Besides, you can bargain and get to know the sellers, which you can't really do in a supermarket.",
      "Mainly for convenience. You can find everything under one roof, pay by card and park easily, so busy families save a lot of time, even though the food isn't always as fresh.",
    ],
    statuses: ["on_topic", "on_topic", "on_topic"],
    levels: { grammar: "above_B1", vocabulary: "above_B1", fluency: "above_B1", cohesion: "above_B1" },
    band: 5,
    label: "Above B1",
    fix: { kind: "feature", feature: "vocabulary" },
    meetsTarget: true,
  },
];
