import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Provider-side audio (docs/consent-design.md, "Audio after 30 days"). The 30-day deletion can only reach audio CEFRO
 * stores. So the app must never leave a stored copy at a scoring provider that it would then have to delete: audio goes
 * inline in the request (Gemini `inlineData`) or as the body of one transcription request (OpenAI
 * `/audio/transcriptions`), never through a provider's file store (Gemini Files API, OpenAI or Anthropic Files). This
 * does NOT mean the provider keeps nothing: providers may keep request data for a limited time under their own terms
 * (Gemini abuse monitoring: 55 days). We can't delete that copy.
 * If this test fails, a provider file upload was added: delete the file right after scoring, or keep audio inline.
 */

const SRC = path.resolve(__dirname, "../..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("no audio is stored at a scoring provider", () => {
  it("no code uses a provider's file store", () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(50);
    const forbidden = [/\.files\.(upload|create)\(/, /upload\/v1beta\/files/, /\/v1\/files\b/, /fileData\s*:/, /fileUri\s*:/, /"store"\s*:\s*true|\bstore:\s*true/];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const pattern of forbidden) expect(text, `${path.relative(SRC, file)} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it("the audio providers send it inline, in the request itself", () => {
    const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
    expect(read("server/transcription/gemini-transcription.ts")).toMatch(/inlineData:/);
    expect(read("server/evaluation/gemini-audio-assessor.ts")).toMatch(/inlineData:/);
    expect(read("server/transcription/openai-transcription.ts")).toMatch(/\/audio\/transcriptions/);
  });
});
