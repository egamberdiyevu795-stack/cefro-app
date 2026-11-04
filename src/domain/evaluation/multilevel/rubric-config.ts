import { z } from "zod";
import { FEATURES, FEATURE_LEVELS } from "./levels";

/**
 * Shape of a Multilevel rubric file (e.g. server/evaluation/rubrics/multilevel_q7.json).
 *
 * One file per exam part. Adding a part (Part 1, Part 3) means adding a file that passes this schema and a registry
 * entry; the scoring code reads caps and labels from here and has no part-specific numbers of its own.
 */
const descriptorSet = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.string().min(1)])) as Record<
  (typeof FEATURES)[number],
  z.ZodString
>);

const capTable = z.record(z.string().regex(/^\d+$/), z.number().int().min(0));

export const multilevelRubricConfigSchema = z
  .object({
    id: z.string().min(1),
    /** Persisted with each evaluation. Bump on any change to this file. */
    version: z.string().min(1),
    exam: z.literal("uzbmb-multilevel-speaking"),
    part: z.number().int().min(1),
    official_question: z.number().int().min(1),
    target_level: z.enum(["B1", "B2"]),
    question_count: z.number().int().min(1).max(6),
    band_max: z.number().int().min(1),
    /** Lowest band that counts as "meets the target level". */
    meets_target_band: z.number().int().min(0),
    bands: z.array(z.object({ band: z.number().int().min(0), label: z.string().min(1), descriptor: z.string().min(1) })),
    /** Official text, copied verbatim, per level the evaluator judges against. */
    descriptors: z.object({ B2: descriptorSet, B1: descriptorSet, below_B1: descriptorSet }),
    /** Where each descriptor set comes from (shown to developers, sent to the model as context). */
    descriptor_sources: z.record(z.string(), z.string()),
    scoring: z.object({
      /** Band cap by number of on-topic questions (keys are counts as strings, "0" … question_count). */
      topic_cap: capTable,
      /** Topic cap when the language level is above_B2 and every question is on topic. */
      above_target_full_coverage_cap: z.number().int().min(0),
      /** Features that must themselves be above_B2 for that lifted cap to apply (otherwise the full-coverage cap stays). */
      above_target_requires: z.array(z.enum(FEATURES)).default([]),
      /** Answers with fewer words than this are not a ratable sample: band 0. 0 switches the check off. */
      min_words: z.number().int().min(0).default(0),
      /** Band cap by overall language level. */
      language_cap: z.object(Object.fromEntries(FEATURE_LEVELS.map((l) => [l, z.number().int().min(0)])) as Record<
        (typeof FEATURE_LEVELS)[number],
        z.ZodNumber
      >),
    }),
  })
  .superRefine((config, ctx) => {
    const bands = config.bands.map((b) => b.band).sort((a, b) => a - b);
    const expected = Array.from({ length: config.band_max + 1 }, (_, i) => i);
    if (bands.join() !== expected.join()) ctx.addIssue({ code: "custom", path: ["bands"], message: `bands must be exactly 0..${config.band_max}` });
    for (let n = 0; n <= config.question_count; n++) {
      if (config.scoring.topic_cap[String(n)] === undefined) {
        ctx.addIssue({ code: "custom", path: ["scoring", "topic_cap"], message: `missing topic cap for ${n} on-topic questions` });
      }
    }
    const caps = [...Object.values(config.scoring.topic_cap), ...Object.values(config.scoring.language_cap), config.scoring.above_target_full_coverage_cap];
    if (caps.some((cap) => cap > config.band_max)) ctx.addIssue({ code: "custom", path: ["scoring"], message: "a cap exceeds band_max" });
    if (config.meets_target_band > config.band_max) ctx.addIssue({ code: "custom", path: ["meets_target_band"], message: "exceeds band_max" });
  });

export type MultilevelRubricConfig = z.infer<typeof multilevelRubricConfigSchema>;
/** The part of the config the deterministic scorer needs (and that is safe to use anywhere). */
export type BandScoringConfig = Pick<MultilevelRubricConfig, "band_max" | "meets_target_band" | "bands" | "scoring" | "question_count">;
