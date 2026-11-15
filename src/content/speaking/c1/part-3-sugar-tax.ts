import { ARGUMENT_INSTRUCTIONS, type BalancedArgumentTask } from "@/domain/speaking/argument-task";

/**
 * Multilevel Part 3 (official Question 8), topic 3 (T3 in docs/part3-plan.md, section 9): a tax on sugary drinks and
 * fast food. CEFRO's own topic and lists.
 */
export const c1Part3SugarTax: BalancedArgumentTask = {
  id: "c1-part3-sugar-tax",
  version: 1,
  level: "C1",
  part: 3,
  taskType: "balanced_argument",
  rubricId: "multilevel-q8",
  title: "A tax on unhealthy food",
  topic: "Health",
  statement: "Governments should put a special tax on sugary drinks and fast food.",
  points: [
    { id: "F1", side: "for", text: "Fewer people would become overweight or ill" },
    { id: "F2", side: "for", text: "The money could pay for health services" },
    { id: "F3", side: "for", text: "Companies would make healthier products" },
    { id: "A1", side: "against", text: "Unfair to families on low incomes" },
    { id: "A2", side: "against", text: "Adults should decide what they eat" },
    { id: "A3", side: "against", text: "Lack of exercise is a bigger problem than food" },
  ],
  instructions: ARGUMENT_INSTRUCTIONS,
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "F1 is developed by a reason or example about higher prices changing habits, diabetes, weight, teeth.",
    "F2 is developed by a reason or example about hospitals, doctors, sports programmes or school meals paid for by the tax.",
    "F3 is developed by a reason or example about less sugar in recipes, new products, companies avoiding the tax.",
    "A1 is developed by a reason or example about poorer families spending a larger share of their money on food.",
    "A2 is developed by a reason or example about personal freedom, the state deciding for adults.",
    "A3 is developed by a reason or example about sitting all day, cars, screens, too little sport.",
    "Saying that healthy food is already cheap at the bazaar argues FOR (against A1) and does not cover A1 unless A1 itself is stated.",
  ].join("\n"),
};
