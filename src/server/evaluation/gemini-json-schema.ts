import "server-only";
import { z } from "zod";

/**
 * Convert a Zod schema into the JSON-Schema subset we send to Gemini
 * (`responseJsonSchema`).
 *
 * The Zod schema stays the single source of truth for the evaluation
 * contract; this only adapts its representation. Keywords outside the
 * subset Gemini documents (string length/pattern/format, `$schema`, defaults)
 * are dropped, and integer bounds beyond 32 bits are removed. Dropping a
 * constraint is safe because every response is re-validated with the full
 * Zod schema before use, so the API's enforcement is a help, not the guard.
 */
const KEPT_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "enum",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "description",
  "additionalProperties",
]);

const INT32_LIMIT = 2 ** 31;

export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // io: "output" = the shape the model must produce; reused: "inline" = no $defs/$ref.
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output", reused: "inline" });
  return sanitize(raw) as Record<string, unknown>;
}

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!KEPT_KEYWORDS.has(key)) continue;
    if ((key === "minimum" || key === "maximum") && typeof value === "number" && Math.abs(value) >= INT32_LIMIT) continue;
    // `properties` maps property NAMES to schemas — never filter the names themselves.
    out[key] = key === "properties" ? sanitizeProperties(value) : sanitize(value);
  }
  return out;
}

function sanitizeProperties(properties: unknown): unknown {
  if (properties === null || typeof properties !== "object") return properties;
  return Object.fromEntries(Object.entries(properties).map(([name, schema]) => [name, sanitize(schema)]));
}
