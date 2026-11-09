import { ARGUMENT_INSTRUCTIONS, type BalancedArgumentTask } from "@/domain/speaking/argument-task";

/**
 * Multilevel Part 3 (official Question 8), topic 2 (T2 in docs/part3-plan.md, section 9): smartphones under 14.
 * CEFRO's own topic and lists.
 */
export const c1Part3SmartphonesUnder14: BalancedArgumentTask = {
  id: "c1-part3-smartphones-under-14",
  version: 1,
  level: "C1",
  part: 3,
  taskType: "balanced_argument",
  rubricId: "multilevel-q8",
  title: "Smartphones for children",
  topic: "Technology",
  statement: "Children under 14 should not be allowed to own a smartphone.",
  points: [
    { id: "F1", side: "for", text: "Less screen time and better sleep" },
    { id: "F2", side: "for", text: "Protection from harmful content online" },
    { id: "F3", side: "for", text: "More face-to-face time with friends" },
    { id: "A1", side: "against", text: "Parents can reach them in an emergency" },
    { id: "A2", side: "against", text: "Useful for learning and homework" },
    { id: "A3", side: "against", text: "Children without one may feel left out" },
  ],
  instructions: ARGUMENT_INSTRUCTIONS,
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "F1 is developed by a reason or example about hours on screens, staying up late, tiredness at school.",
    "F2 is developed by a reason or example about violent or adult content, strangers, scams or bullying online.",
    "F3 is developed by a reason or example about playing outside, talking in person, friendships offline.",
    "A1 is developed by a reason or example about getting lost, being late, an accident, calling home.",
    "A2 is developed by a reason or example about dictionaries, online lessons, research, educational apps.",
    "A3 is developed by a reason or example about group chats, classmates' games, being teased or excluded.",
    "Saying that a basic phone without internet is enough argues FOR (against A1) and does not cover A1 unless A1 itself is stated.",
  ].join("\n"),
};
