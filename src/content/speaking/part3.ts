import type { BalancedArgumentTask } from "@/domain/speaking/argument-task";
import { c1Part3CarsInCityCentres } from "./c1/part-3-cars-in-city-centres";
import { c1Part3SmartphonesUnder14 } from "./c1/part-3-smartphones-under-14";
import { c1Part3SugarTax } from "./c1/part-3-sugar-tax";

/**
 * The Part 3 topics (v1: the three of docs/part3-plan.md, decision 9), in the order the Part 3 list shows them.
 * Separate from the Part 2 registry (`./index.ts`): nothing in the real practice flow or the attempts API can reach
 * a Part 3 task while Part 3 is not live.
 */
const TASKS: readonly BalancedArgumentTask[] = [c1Part3CarsInCityCentres, c1Part3SmartphonesUnder14, c1Part3SugarTax];

export function listArgumentTasks(): readonly BalancedArgumentTask[] {
  return TASKS;
}

export function getArgumentTask(id: string): BalancedArgumentTask | undefined {
  return TASKS.find((task) => task.id === id);
}
