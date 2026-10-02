import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { isQuoteInTranscript, evidenceTokens } from "@/domain/evaluation/evidence";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { getTranscriptionProvider } from "@/server/transcription";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * Transcribes REAL recordings with the configured provider (and, if an
 * evaluator is configured, evaluates them), then writes a review report.
 *
 * Put recordings in local-samples/ (gitignored — never commit student audio):
 *   local-samples/<name>.webm|.m4a|.mp3|.wav|.ogg
 *   local-samples/<name>.txt   (optional) lines:
 *       ref: <what was actually said, verbatim, including mistakes>
 *       keep: <an error that must survive transcription, e.g. "he go to school">
 *       seconds: <recording length, for WPM>
 *
 *   TRANSCRIPTION_PROVIDER=openai OPENAI_API_KEY=... npm run eval:transcription
 */
const DIR = path.join(process.cwd(), "local-samples");
const MIME: Record<string, string> = { ".webm": "audio/webm", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => MIME[path.extname(f)]) : [];
const configured = process.env.TRANSCRIPTION_PROVIDER !== "mock" && Boolean(process.env.OPENAI_API_KEY) && files.length > 0;
const evaluate = evaluatorSelection().configured;
const task = getSpeakingTask("b2-part2-technology-young-people")!;

interface Row {
  file: string;
  text?: string;
  error?: string;
  latencyMs?: number;
  wer?: number;
  keptErrors: { phrase: string; kept: boolean }[];
  level?: string;
}

describe.skipIf(!configured)("LIVE: real transcription of local recordings", () => {
  const rows: Row[] = [];

  it.each(files.map((f) => [f]))("%s", async (file) => {
    const sidecar = readSidecar(path.join(DIR, `${path.parse(file).name}.txt`));
    const row: Row = { file, keptErrors: [] };
    rows.push(row);
    const audio = fs.readFileSync(path.join(DIR, file));
    const started = Date.now();
    try {
      const output = await getTranscriptionProvider().transcribe({ audio, mimeType: MIME[path.extname(file)], language: "en" });
      row.text = output.text;
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      // Silence/empty recordings are expected to fail with transcription_empty.
      if (file.includes("silence")) return expect((error as { failureCode?: string }).failureCode).toBe("transcription_empty");
      throw error;
    }
    row.latencyMs = Date.now() - started;
    if (sidecar.ref) row.wer = wordErrorRate(sidecar.ref, row.text);
    row.keptErrors = sidecar.keep.map((phrase) => ({ phrase, kept: isQuoteInTranscript(phrase, row.text!) }));
    expect.soft(row.keptErrors.filter((k) => !k.kept).map((k) => k.phrase), `${file}: learner errors corrected by STT`).toEqual([]);

    if (evaluate && evidenceTokens(row.text).length >= 5) {
      const seconds = sidecar.seconds ?? 120;
      const metrics = computeSpeechMetrics(row.text, seconds * 1000, task.speakingSeconds);
      const evaluation = await evaluateSpeaking(
        {
          task,
          rubric: getSpeakingRubric("B2"),
          transcript: row.text,
          metrics,
          audio: { storageProvider: "local-samples", storageKey: file, mimeType: MIME[path.extname(file)], durationMs: seconds * 1000 },
          previousAttempt: null,
        },
        getEvaluationModel(),
      );
      row.level = evaluation.result.overall_level;
    }
  });

  it("writes the review report", () => {
    const md = [
      "# Live transcription report",
      "",
      "| File | Latency | WER vs ref | Learner errors kept | Level | Error |",
      "|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.file} | ${r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"} | ${r.wer === undefined ? "—" : `${(r.wer * 100).toFixed(0)}%`} | ${r.keptErrors.map((k) => `${k.kept ? "✓" : "✗"} ${k.phrase}`).join("; ") || "—"} | ${r.level ?? "—"} | ${r.error ?? ""} |`,
      ),
      "",
      ...rows.flatMap((r) => [`## ${r.file}`, "", `> ${r.text ?? "(no transcript)"}`, ""]),
    ].join("\n");
    console.log(`\nReview report: ${writeReport("live-transcription", md, rows)}\n`);
  });
});

function readSidecar(file: string) {
  const out = { ref: undefined as string | undefined, keep: [] as string[], seconds: undefined as number | undefined };
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key.trim() === "ref") out.ref = value;
    if (key.trim() === "keep" && value) out.keep.push(value);
    if (key.trim() === "seconds") out.seconds = Number(value);
  }
  return out;
}

/** Word error rate (Levenshtein distance on word tokens / reference length). */
function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = evidenceTokens(reference);
  const hyp = evidenceTokens(hypothesis);
  const dp = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) dp[0][j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return ref.length ? dp[ref.length][hyp.length] / ref.length : 0;
}
