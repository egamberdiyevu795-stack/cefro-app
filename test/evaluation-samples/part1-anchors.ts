import type { FeatureLevel, QuestionStatus } from "@/domain/evaluation/multilevel/levels";

/**
 * Part 1 anchor answers (docs/part1-plan.md §4): made-up answers (no real student data) with the judgements we
 * expect from the model and the band the code must compute from them. TEST-ONLY: never imported by app code and never
 * in a prompt (checked by part1-anchors.test.ts). Pronunciation is not assessed (transcript only), so each result is
 * provisional and the mean uses grammar, vocabulary, fluency (+ cohesion in 1.2).
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
    fix: { kind: "feature", feature: "grammar" },
    meetsTarget: true,
  },
  {
    id: "1.2-low",
    part: "1.2",
    answers: [
      "In first picture is a family. They cooking in kitchen. Second picture, young people, they eat burger. First is home, second is café.",
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
      "In the first picture there is a family who are cooking together at home. In the second picture some teenagers are eating burgers in a café. The first one looks more healthy and calm, but the second is more fun.",
      "I prefer eat at home because my mother cook very good and is cheaper. But sometimes I go to café with friends.",
      "Now people eat more fast food. Before, people eat at home every day. Now many fast food is in Tashkent.",
    ],
    statuses: ["on_topic", "on_topic", "on_topic"],
    levels: { grammar: "A2", vocabulary: "A2", fluency: "B1", cohesion: "B1" },
    band: 2,
    label: "Higher A2",
    fix: { kind: "feature", feature: "grammar" },
    meetsTarget: false,
  },
  {
    id: "1.2-high",
    part: "1.2",
    answers: [
      "Both pictures are about eating, but they show very different situations. In the first one, a family is preparing dinner together, which looks relaxed and quite healthy. The second shows teenagers grabbing burgers in a fast-food place, so it's quicker but probably less healthy.",
      "Honestly, I'd rather eat at home. Home-cooked food is fresher, and it's a chance to talk to my family, although I don't mind eating out on special occasions.",
      "I think they've changed a lot. Ten years ago fast food was rare, whereas now there are chains everywhere, so young people eat out much more and families cook together less.",
    ],
    statuses: ["on_topic", "on_topic", "on_topic"],
    levels: { grammar: "above_B1", vocabulary: "above_B1", fluency: "above_B1", cohesion: "above_B1" },
    band: 5,
    label: "Above B1",
    fix: { kind: "feature", feature: "grammar" },
    meetsTarget: true,
  },
];
