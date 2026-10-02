import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluationResultSchema } from "@/domain/evaluation/schema";
import { toGeminiJsonSchema } from "./gemini-json-schema";

function collectKeys(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectKeys(n, found));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (key === "properties") Object.values(value as object).forEach((v) => collectKeys(v, found));
      else collectKeys(value, found);
    }
  }
  return found;
}

describe("toGeminiJsonSchema", () => {
  const schema = toGeminiJsonSchema(evaluationResultSchema) as {
    type: string;
    required: string[];
    properties: Record<string, { type?: string; description?: string; anyOf?: unknown[] }>;
  };

  it("describes the evaluation contract with every top-level field required", () => {
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(
      expect.arrayContaining(["overall_level", "criteria", "task_coverage", "strengths", "issues", "retry_focus", "retry_review", "reliability_note"]),
    );
    expect(Object.keys(schema.properties)).toEqual(Object.keys(evaluationResultSchema.shape));
  });

  it("is fully inlined and uses only the keywords we send", () => {
    const keys = collectKeys(schema);
    for (const unsupported of ["$schema", "$ref", "$defs", "minLength", "maxLength", "pattern", "format", "default"]) {
      expect(keys.has(unsupported), unsupported).toBe(false);
    }
    expect(JSON.stringify(schema)).not.toMatch(/9007199254740991/);
  });

  it("keeps nullability, enums, bounds and field guidance", () => {
    expect(schema.properties.retry_review.anyOf).toEqual(expect.arrayContaining([{ type: "null" }]));
    const json = JSON.stringify(schema);
    expect(json).toContain('"enum":["A1","A2"');
    expect(json).toContain('"maximum":10');
    expect(json).toContain("Never generic");
    expect(json).toContain('"maxItems":4');
  });

  it("does not drop property NAMES that collide with keyword names", () => {
    const converted = toGeminiJsonSchema(z.object({ type: z.string(), items: z.array(z.string()), required: z.boolean() })) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(converted.properties)).toEqual(["type", "items", "required"]);
  });
});
