import type { BalancedArgumentTask } from "@/domain/speaking/argument-task";
import { PART3_BANK_META, PART3_BANK_TASKS } from "./c1/part-3-bank";
import { c1Part3CarsInCityCentres } from "./c1/part-3-cars-in-city-centres";
import { c1Part3SmartphonesUnder14 } from "./c1/part-3-smartphones-under-14";
import { c1Part3SugarTax } from "./c1/part-3-sugar-tax";

/**
 * The Part 3 topics, in the order the Part 3 list shows them: the bank's frequent exam topics first (c1/part-3-bank.ts,
 * 2026-11-15), then our three v1 topics (docs/part3-plan.md, decision 9), then the rarer exam topics.
 * Separate from the Part 2 registry (`./index.ts`): nothing in the real practice flow or the attempts API can reach
 * a Part 3 task while Part 3 is not live.
 */
const V1_TASKS: readonly BalancedArgumentTask[] = [c1Part3CarsInCityCentres, c1Part3SmartphonesUnder14, c1Part3SugarTax];
const TASKS: readonly BalancedArgumentTask[] = [
  ...PART3_BANK_TASKS.filter((t) => PART3_BANK_META[t.id]!.source === "frequent"),
  ...V1_TASKS,
  ...PART3_BANK_TASKS.filter((t) => PART3_BANK_META[t.id]!.source !== "frequent"),
];

export function listArgumentTasks(): readonly BalancedArgumentTask[] {
  return TASKS;
}

export function getArgumentTask(id: string): BalancedArgumentTask | undefined {
  return TASKS.find((task) => task.id === id);
}

/**
 * How often a topic comes up in a mock, relative to the others (owner decision 2026-11-15: frequent topics most, rare
 * ones rarely). The teacher's count for the frequent topics (3–5; a row holding two topics shares its count), 1 for the
 * rarer ones, the screenshot topic and our own v1 topics. Unknown ids: 1.
 */
export function part3TopicWeight(id: string): number {
  return PART3_BANK_META[id]?.weight ?? 1;
}
