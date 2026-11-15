import { ARGUMENT_INSTRUCTIONS, type BalancedArgumentTask } from "@/domain/speaking/argument-task";

/**
 * Multilevel Part 3 (official Question 8), topic 1: cars in city centres. CEFRO's own topic and lists
 * (docs/part3-plan.md, section 8); the official sample is never used as content.
 */
export const c1Part3CarsInCityCentres: BalancedArgumentTask = {
  id: "c1-part3-cars-in-city-centres",
  version: 1,
  level: "C1",
  part: 3,
  taskType: "balanced_argument",
  rubricId: "multilevel-q8",
  title: "Cars in city centres",
  topic: "Cities & transport",
  statement: "Cities should ban private cars from their centres.",
  points: [
    { id: "F1", side: "for", text: "Cleaner air and less noise" },
    { id: "F2", side: "for", text: "Safer streets for pedestrians and cyclists" },
    { id: "F3", side: "for", text: "More people would use public transport" },
    { id: "A1", side: "against", text: "Difficult for elderly and disabled people" },
    { id: "A2", side: "against", text: "Shops and businesses in the centre may lose customers" },
    { id: "A3", side: "against", text: "Public transport is not good enough in many cities" },
  ],
  instructions: ARGUMENT_INSTRUCTIONS,
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "F1 is developed by a reason or example about pollution, exhaust, breathing, health or noise in the centre.",
    "F2 is developed by a reason or example about accidents, crossing roads, children walking or cycling safely.",
    "F3 is developed by why or how people would switch to buses, the metro or trams without cars.",
    "A1 is developed by a reason or example about people who cannot walk far or depend on a car (hospitals, offices, family members).",
    "A2 is developed by a reason or example about trade, parking, customers going elsewhere (malls), shops closing.",
    "A3 is developed by a reason or example about crowded, slow, unreliable or missing public transport.",
    "Saying that the metro is cheap and fast argues FOR (against A3) and does not cover A3 unless A3 itself is stated.",
  ].join("\n"),
};
