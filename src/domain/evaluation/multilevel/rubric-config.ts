import { z } from "zod";
import { ALL_FEATURE_LEVELS, FEATURES, FEATURE_LEVELS, QUESTION_STATUSES, type LevelLadder } from "./levels";

/**
 * Shape of a Multilevel rubric file (e.g. server/evaluation/rubrics/multilevel_q7.json).
 *
 * One file per exam part. Adding a part means adding a file that passes this schema and a registry entry; the
 * scoring code reads caps, labels, level names, features and question statuses from here and has no part-specific
 * numbers of its own. The per-rubric fields (`levels`, `features`, `question_statuses`, `first_question_number`,
 * `min_relevant_words`) default to Part 2's values, so `multilevel_q7.json` needed no change.
 */
const featureEnum = z.enum(FEATURES);
const levelEnum = z.enum(ALL_FEATURE_LEVELS);
const descriptorSet = z.partialRecord(featureEnum, z.string().min(1));
const capTable = z.record(z.string().regex(/^\d+$/), z.number().int().min(0));

export const multilevelRubricConfigSchema = z
  .object({
    id: z.string().min(1),
    /** Persisted with each evaluation. Bump on any change to this file. */
    version: z.string().min(1),
    exam: z.literal("uzbmb-multilevel-speaking"),
    part: z.number().int().min(1),
    official_question: z.number().int().min(1),
    /** Official number of the task's first question, as the student sees it (Part 1.2: 4). */
    first_question_number: z.number().int().min(1).default(1),
    target_level: z.enum(["A2", "B1", "B2"]),
    question_count: z.number().int().min(1).max(6),
    band_max: z.number().int().min(1),
    /** Lowest band that counts as "meets the target level". */
    meets_target_band: z.number().int().min(0),
    /** The four level names, lowest first: [below the scale, lower level, target, above the target]. */
    levels: z.tuple([levelEnum, levelEnum, levelEnum, levelEnum]).default([...FEATURE_LEVELS]),
    /** The features this part is rated on (Part 1.1 has no cohesion). Display order follows FEATURES. */
    features: z.array(featureEnum).min(1).default([...FEATURES]),
    /** The question statuses the model may use for this part. */
    question_statuses: z.array(z.enum(QUESTION_STATUSES)).min(2).default([...QUESTION_STATUSES]),
    bands: z.array(z.object({ band: z.number().int().min(0), label: z.string().min(1), descriptor: z.string().min(1) })),
    /**
     * Text per level, keyed by the rubric's level names: the official descriptors (verbatim) for the target and the
     * level below it, and reference text (background for the model only) for the levels outside the scale.
     */
    descriptors: z.partialRecord(levelEnum, descriptorSet),
    /** Where each descriptor set comes from (shown to developers, sent to the model as context). */
    descriptor_sources: z.record(z.string(), z.string()),
    scoring: z.object({
      /** Band cap by number of on-topic questions (keys are counts as strings, "0" … question_count). */
      topic_cap: capTable,
      /** Topic cap when the language level is above the target and every question is on topic. */
      above_target_full_coverage_cap: z.number().int().min(0),
      /** Features that must themselves be above the target for that lifted cap to apply. */
      above_target_requires: z.array(featureEnum).default([]),
      /** Answers with fewer words than this are not a ratable sample: band 0. 0 switches the check off. */
      min_words: z.number().int().min(0).default(0),
      /**
       * Fewer relevant words than this in the whole part = band 0 (no ratable sample). Relevant words are the words
       * inside the verified evidence quotes of the questions that count as on topic, fillers excluded. 0 = off.
       */
      min_relevant_words: z.number().int().min(0).default(0),
      /** Band cap by overall language level, keyed by the rubric's level names. */
      language_cap: z.partialRecord(levelEnum, z.number().int().min(0)),
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
    if (caps.some((cap) => cap !== undefined && cap > config.band_max)) ctx.addIssue({ code: "custom", path: ["scoring"], message: "a cap exceeds band_max" });
    if (config.meets_target_band > config.band_max) ctx.addIssue({ code: "custom", path: ["meets_target_band"], message: "exceeds band_max" });

    const ladder = config.levels;
    if (new Set(ladder).size !== 4) ctx.addIssue({ code: "custom", path: ["levels"], message: "levels must be four different names" });
    if (ladder[2] !== config.target_level) ctx.addIssue({ code: "custom", path: ["levels"], message: "the third level must be the target level" });
    const capKeys = Object.keys(config.scoring.language_cap).sort();
    if (capKeys.join() !== [...ladder].sort().join()) ctx.addIssue({ code: "custom", path: ["scoring", "language_cap"], message: "language_cap must have exactly the rubric's levels" });
    for (const key of Object.keys(config.descriptors)) {
      if (!(ladder as readonly string[]).includes(key)) ctx.addIssue({ code: "custom", path: ["descriptors", key], message: "not one of the rubric's levels" });
    }
    // The official scale (the target and the level below it) has text for every feature of the part.
    for (const level of [ladder[1], ladder[2]]) {
      for (const feature of config.features) {
        if (!config.descriptors[level]?.[feature]) ctx.addIssue({ code: "custom", path: ["descriptors", level, feature], message: "missing official descriptor" });
      }
    }
    for (const set of Object.values(config.descriptors)) {
      for (const feature of Object.keys(set ?? {})) {
        if (!config.features.includes(feature as (typeof FEATURES)[number])) ctx.addIssue({ code: "custom", path: ["descriptors"], message: `${feature} is not a feature of this rubric` });
      }
    }
    for (const feature of config.scoring.above_target_requires) {
      if (!config.features.includes(feature)) ctx.addIssue({ code: "custom", path: ["scoring", "above_target_requires"], message: `${feature} is not a feature of this rubric` });
    }
    for (const status of ["on_topic", "missing", "off_topic"] as const) {
      if (!config.question_statuses.includes(status)) ctx.addIssue({ code: "custom", path: ["question_statuses"], message: `${status} is always allowed` });
    }
  });

export type MultilevelRubricConfig = z.infer<typeof multilevelRubricConfigSchema>;
/** The part of the config the deterministic scorer needs (and that is safe to use anywhere). */
export type BandScoringConfig = Pick<MultilevelRubricConfig, "band_max" | "meets_target_band" | "bands" | "scoring" | "question_count"> &
  Partial<Pick<MultilevelRubricConfig, "levels" | "features">>;

export function ladderOfConfig(config: Partial<Pick<MultilevelRubricConfig, "levels">>): LevelLadder {
  return config.levels ?? FEATURE_LEVELS;
}
