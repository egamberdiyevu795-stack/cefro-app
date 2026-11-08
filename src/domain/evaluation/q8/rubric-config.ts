import { z } from "zod";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import { promptOverlapConfigSchema } from "@/domain/evaluation/multilevel/prompt-overlap";
import { PROMPT_DEPENDENCE_LEVELS } from "@/domain/evaluation/multilevel/prompt-overlap";
import { Q8_LEVELS } from "./levels";

/**
 * Shape of the Part 3 rubric file (server/evaluation/rubrics/multilevel_q8.json). Same pattern as Part 2's
 * `multilevelRubricConfigSchema`, with Part 3's own caps: coverage, prompt dependence and language on the C1 ladder
 * (docs/part3-plan.md, section 4). Every number the scorer uses is here, none in code.
 */
const descriptorSet = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.string().min(1)])) as Record<
  (typeof FEATURES)[number],
  z.ZodString
>);

export const COVERAGE_LEVELS = ["none", "one_side", "both_sides", "both_sides_full"] as const;
export type Coverage = (typeof COVERAGE_LEVELS)[number];

const caps = <T extends readonly string[]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.number().int().min(0)])) as Record<T[number], z.ZodNumber>);

export const q8RubricConfigSchema = z
  .object({
    id: z.literal("multilevel-q8"),
    /** Persisted with each evaluation. Bump on any change to this file. */
    version: z.string().min(1),
    exam: z.literal("uzbmb-multilevel-speaking"),
    part: z.literal(3),
    official_question: z.literal(8),
    target_level: z.literal("C1"),
    /** Points per side the student must choose. */
    points_per_side: z.number().int().min(1),
    band_max: z.number().int().min(1),
    meets_target_band: z.number().int().min(0),
    bands: z.array(z.object({ band: z.number().int().min(0), label: z.string().min(1), descriptor: z.string().min(1) })),
    /** Official text per level the evaluator judges against (C1 from Q8; B2, B1, below-B1 reused from Q7). */
    descriptors: z.object({ C1: descriptorSet, B2: descriptorSet, B1: descriptorSet, below_B1: descriptorSet }),
    descriptor_sources: z.record(z.string(), z.string()),
    scoring: z.object({
      coverage_cap: caps(COVERAGE_LEVELS),
      dependence_cap: caps(PROMPT_DEPENDENCE_LEVELS),
      language_cap: caps(Q8_LEVELS),
      /**
       * Band-6 gate (decision 7): the above_C1 language cap applies only when these features are themselves above_C1;
       * otherwise above_C1 language is capped at `above_target_gate_cap`. The same mechanism as Part 2's band 5.
       */
      above_target_requires: z.array(z.enum(FEATURES)),
      above_target_gate_cap: z.number().int().min(0),
    }),
    /** Prompt-overlap thresholds (section 6), flag-only except the override (decisions 4 and 6). */
    overlap: promptOverlapConfigSchema,
  })
  .superRefine((config, ctx) => {
    const bands = config.bands.map((b) => b.band).sort((a, b) => a - b);
    const expected = Array.from({ length: config.band_max + 1 }, (_, i) => i);
    if (bands.join() !== expected.join()) ctx.addIssue({ code: "custom", path: ["bands"], message: `bands must be exactly 0..${config.band_max}` });
    const all = [
      ...Object.values(config.scoring.coverage_cap),
      ...Object.values(config.scoring.dependence_cap),
      ...Object.values(config.scoring.language_cap),
      config.scoring.above_target_gate_cap,
    ];
    if (all.some((cap) => cap > config.band_max)) ctx.addIssue({ code: "custom", path: ["scoring"], message: "a cap exceeds band_max" });
    if (config.meets_target_band > config.band_max) ctx.addIssue({ code: "custom", path: ["meets_target_band"], message: "exceeds band_max" });
  });

export type Q8RubricConfig = z.infer<typeof q8RubricConfigSchema>;
/** What the deterministic scorer needs. */
export type Q8ScoringConfig = Pick<Q8RubricConfig, "band_max" | "meets_target_band" | "bands" | "scoring" | "points_per_side" | "overlap">;
