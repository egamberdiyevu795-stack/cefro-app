import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { multilevelRubricConfigSchema } from "@/domain/evaluation/multilevel/rubric-config";
import rawQ1to3 from "./multilevel_q1_3.json";
import rawQ4to6 from "./multilevel_q4_6.json";
import rawQ7 from "./multilevel_q7.json";

/*
 * docs/part1-plan.md §2: "Each rubric JSON holds its own copy, and a unit test checks every file against this
 * section." The official tables are read from the plan itself, so a change on either side fails here.
 */
const plan = fs.readFileSync(path.join(process.cwd(), "docs", "part1-plan.md"), "utf8");
const q13 = multilevelRubricConfigSchema.parse(rawQ1to3);
const q46 = multilevelRubricConfigSchema.parse(rawQ4to6);
const q7 = multilevelRubricConfigSchema.parse(rawQ7);

/** The rows of the first table after `heading` (inside the plan section that starts at `section`). */
function table(section: string, heading: string): string[][] {
  const from = plan.indexOf(section);
  const at = plan.indexOf(heading, from);
  if (from < 0 || at < 0) throw new Error(`Plan has no "${heading}" under "${section}"`);
  const lines = plan.slice(at).split("\n").slice(1);
  const start = lines.findIndex((l) => l.startsWith("|"));
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) break;
    rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
  }
  return rows.slice(2); // header and separator
}

const features = (rows: string[][]) => Object.fromEntries(rows.map(([f, text]) => [f.toLowerCase(), text]));

describe("Part 1 rubrics match docs/part1-plan.md §2 word for word", () => {
  it("Part 1.1: A2 and A1 descriptors, no cohesion", () => {
    expect(q13.descriptors.A2).toEqual(features(table("### Part 1.1 — Questions 1–3, target A2", "**A2 descriptors**")));
    expect(q13.descriptors.A1).toEqual(features(table("### Part 1.1 — Questions 1–3, target A2", "**A1 descriptors**")));
    expect(q13.features).not.toContain("cohesion");
  });

  it("Part 1.2: B1 and A2 descriptors, with cohesion", () => {
    expect(q46.descriptors.B1).toEqual(features(table("### Part 1.2 — Questions 4–6, target B1", "**B1 descriptors**")));
    expect(q46.descriptors.A2).toEqual(features(table("### Part 1.2 — Questions 4–6, target B1", "**A2 descriptors**")));
    expect(q46.features).toContain("cohesion");
  });

  it.each([
    ["### Part 1.1 — Questions 1–3, target A2", q13],
    ["### Part 1.2 — Questions 4–6, target B1", q46],
  ] as const)("%s: band labels as in the plan, band descriptors from its official rules", (section, config) => {
    const rows = table(section, "| Band | Label | Official rule |".slice(0, 6));
    for (const [band, label, rule] of rows) {
      const entry = config.bands.find((b) => b.band === Number(band))!;
      if (label !== "—") expect(entry.label).toBe(label);
      expect(entry.descriptor.replace(/\.$/, "")).toBe(rule.replace(/\.$/, ""));
    }
  });

  it("the same level name keeps each rubric's own text (A2 fluency, B1 vocabulary)", () => {
    expect(q13.descriptors.A2!.fluency).toMatch(/, but the meaning is still clear\.$/);
    expect(q46.descriptors.A2!.fluency).not.toMatch(/meaning is still clear/);
    expect(q46.descriptors.B1!.vocabulary).not.toBe(q7.descriptors.B1!.vocabulary);
  });

  it("reference texts are borrowed as decided (decision 11) and marked as reference", () => {
    for (const f of ["grammar", "vocabulary", "pronunciation", "fluency"] as const) {
      expect(q13.descriptors.above_A2![f]).toBe(q46.descriptors.B1![f]);
      expect(q46.descriptors.below_A2![f]).toBe(q13.descriptors.A1![f]);
    }
    for (const f of q7.features) expect(q46.descriptors.above_B1![f]).toBe(q7.descriptors.B2![f]);
    expect(q46.descriptors.below_A2!.cohesion).toBeUndefined();
    expect(q13.descriptors.below_A1).toBeUndefined();
    expect(q13.descriptor_sources.above_A2).toMatch(/^Reference only/);
    expect(q46.descriptor_sources.above_B1).toMatch(/^Reference only/);
    expect(q46.descriptor_sources.below_A2).toMatch(/^Reference only/);
  });

  it("scoring config as in the plan's table", () => {
    for (const c of [q13, q46]) {
      expect(c.scoring.topic_cap).toEqual({ 0: 0, 1: 1, 2: 3, 3: 4 });
      expect(c.scoring.above_target_full_coverage_cap).toBe(5);
      expect(c.scoring.above_target_requires).toEqual(["grammar", "vocabulary"]);
      expect(c.meets_target_band).toBe(3);
    }
    expect(q13.scoring.language_cap).toEqual({ below_A1: 0, A1: 2, A2: 4, above_A2: 5 });
    expect(q46.scoring.language_cap).toEqual({ below_A2: 0, A2: 2, B1: 4, above_B1: 5 });
    expect(q13.scoring.min_relevant_words).toBe(0);
    expect(q46.scoring.min_relevant_words).toBe(5);
  });

  it("ladders, statuses and versions", () => {
    expect(q13.levels).toEqual(["below_A1", "A1", "A2", "above_A2"]);
    expect(q46.levels).toEqual(["below_A2", "A2", "B1", "above_B1"]);
    expect(q13.question_statuses).toEqual(["on_topic", "missing", "off_topic"]);
    expect(q46.question_statuses).toEqual(["on_topic", "partial", "missing", "off_topic"]);
    expect([q13.version, q46.version]).toEqual(["multilevel-q1-3/1.0.0", "multilevel-q4-6/1.0.0"]);
    expect([q13.first_question_number, q46.first_question_number]).toEqual([1, 4]);
  });

  it("Part 2's rubric reads as before: its defaults are Part 2's own levels, features and statuses", () => {
    expect(q7.levels).toEqual(["below_B1", "B1", "B2", "above_B2"]);
    expect(q7.features).toEqual(["grammar", "vocabulary", "pronunciation", "fluency", "cohesion"]);
    expect(q7.question_statuses).toEqual(["on_topic", "partial", "minimal", "missing", "off_topic"]);
    expect(q7.scoring.min_relevant_words).toBe(0);
    expect(q7.version).toBe("multilevel-q7/2.1.0");
  });

  it("a rubric whose cap table misses one of its levels, or names a level not on its ladder, is refused", () => {
    expect(() => multilevelRubricConfigSchema.parse({ ...rawQ1to3, scoring: { ...rawQ1to3.scoring, language_cap: { below_A1: 0, A1: 2, A2: 4 } } })).toThrow();
    expect(() => multilevelRubricConfigSchema.parse({ ...rawQ1to3, descriptors: { ...rawQ1to3.descriptors, B2: { grammar: "x" } } })).toThrow();
    expect(() => multilevelRubricConfigSchema.parse({ ...rawQ1to3, descriptors: { ...rawQ1to3.descriptors, A2: { ...rawQ1to3.descriptors.A2, cohesion: "x" } } })).toThrow();
  });
});
