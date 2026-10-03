import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { evidenceTokens, isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { computeSpeechMetrics, type SpeechMetrics } from "@/domain/speaking/metrics";
import { ProviderError } from "@/server/errors";
import { getTranscriptionProvider } from "@/server/transcription";
import { VERBATIM_TRANSCRIPTION_PROMPT } from "@/server/transcription/openai-transcription";
import {
  MIME_BY_FORMAT,
  ffmpegAvailable,
  makeNearSilence,
  makeSilence,
  probeDurationSeconds,
  speechFile,
  ttsLog,
  type AudioFormat,
} from "./audio";
import { endpointOverrides, wordErrorRate } from "./checks";
import { FORMAT_SAMPLE_REF, TRANSCRIPTION_SAMPLES } from "./audio-samples";
import { writeReport } from "./report";

/**
 * REAL OpenAI transcription validation on controlled audio (see audio.ts for what the audio is and is not).
 *
 *   TRANSCRIPTION_PROVIDER=openai OPENAI_API_KEY=... npm run eval:transcription:controlled
 *
 * It answers one question: does the transcript faithfully represent what was said, well enough for CEFRO to
 * evaluate it? Hard assertions cover only safety properties (silence must not produce a fabricated or
 * prompt-derived transcript; the provider must not fail on supported formats). Everything about fidelity (errors
 * corrected, words dropped, fillers lost) is MEASURED AND REPORTED, never normalised away or failed silently.
 */
const task = getSpeakingTask("b2-part2-technology-young-people")!;
const configured = process.env.TRANSCRIPTION_PROVIDER !== "mock" && Boolean(process.env.OPENAI_API_KEY) && ffmpegAvailable();
if (!configured) console.log("\nLIVE controlled transcription skipped: needs OPENAI_API_KEY (TRANSCRIPTION_PROVIDER=openai) and ffmpeg/ffprobe.\n");

interface Row {
  id: string;
  description: string;
  format: AudioFormat;
  mime: string;
  audioSeconds: number;
  latencyMs?: number;
  transcript?: string;
  outcome: "transcribed" | "rejected_empty" | "error";
  errorCode?: string;
  usage?: Record<string, number | string>;
  ref?: string;
  wer?: number;
  keptErrors: { phrase: string; kept: boolean }[];
  metricsFromTranscript?: SpeechMetrics;
  metricsFromRef?: SpeechMetrics;
  findings: string[]; // things to read, not necessarily failures
}

const PROMPT_WORDS = new Set(evidenceTokens(VERBATIM_TRANSCRIPTION_PROMPT));
const DISTINCTIVE_PROMPT_WORDS = ["verbatim", "transcript", "learner", "grammar", "hesitation", "speaking", "exam"];
const TASK_WORDS = new Set(evidenceTokens([task.question, ...task.prompts].join(" ")));
const FILLER_RE = /\b(um+|uh+|er+m?|hmm+)\b/gi;

describe.skipIf(!configured)("LIVE: OpenAI transcription on controlled audio", () => {
  const rows: Row[] = [];
  const provider = () => getTranscriptionProvider();

  async function transcribeFile(file: string, format: AudioFormat) {
    const started = Date.now();
    const output = await provider().transcribe({ audio: fs.readFileSync(file), mimeType: MIME_BY_FORMAT[format], language: "en" });
    return { output, latencyMs: Date.now() - started };
  }

  it.each(TRANSCRIPTION_SAMPLES.map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    const format: AudioFormat = "webm"; // the format the browser recorder produces
    const file =
      sample.kind === "silence" ? makeSilence(sample.seconds ?? 8, format) : sample.kind === "near_silence" ? makeNearSilence(sample.seconds ?? 8, format) : await speechFile(sample.ref!, format);
    const row: Row = {
      id: sample.id,
      description: sample.description,
      format,
      mime: MIME_BY_FORMAT[format],
      audioSeconds: probeDurationSeconds(file),
      outcome: "transcribed",
      ref: sample.ref,
      keptErrors: [],
      findings: [],
    };
    rows.push(row);

    try {
      const { output, latencyMs } = await transcribeFile(file, format);
      row.latencyMs = latencyMs;
      row.transcript = output.text;
      row.usage = output.usage;
    } catch (error) {
      row.outcome = error instanceof ProviderError && error.failureCode === "transcription_empty" ? "rejected_empty" : "error";
      row.errorCode = error instanceof ProviderError ? error.failureCode : "unknown";
      if (sample.kind === "speech") throw error; // speech must transcribe
      if (row.outcome !== "rejected_empty") throw error;
    }

    const words = evidenceTokens(row.transcript ?? "");
    if (sample.kind !== "speech") {
      // Silence must never become a fabricated answer or an echo of the prompt/task.
      const echoed = words.filter((w) => DISTINCTIVE_PROMPT_WORDS.includes(w));
      expect(echoed, `${sample.id}: transcript contains words from the transcription prompt`).toEqual([]);
      expect(words.length, `${sample.id}: silence produced a transcript long enough to be graded`).toBeLessThan(5);
      const taskish = words.filter((w) => TASK_WORDS.has(w) && w.length > 4);
      expect(taskish, `${sample.id}: transcript contains task words`).toEqual([]);
      row.findings.push(row.outcome === "rejected_empty" ? "Rejected as an echo of the prompt (transcription_empty)." : `Returned ${words.length} word(s): "${row.transcript}"`);
      return;
    }

    const transcript = row.transcript!;
    row.wer = wordErrorRate(sample.ref!, transcript);
    row.keptErrors = (sample.keep ?? []).map((phrase) => ({ phrase, kept: isQuoteInTranscript(phrase, transcript) }));
    row.metricsFromTranscript = computeSpeechMetrics(transcript, row.audioSeconds * 1000, task.speakingSeconds);
    row.metricsFromRef = computeSpeechMetrics(sample.ref!, row.audioSeconds * 1000, task.speakingSeconds);

    const lost = row.keptErrors.filter((k) => !k.kept).map((k) => k.phrase);
    if (lost.length) row.findings.push(`Learner errors NOT preserved: ${lost.join("; ")}`);
    const refFillers = (sample.ref!.match(FILLER_RE) ?? []).length;
    const gotFillers = (transcript.match(FILLER_RE) ?? []).length;
    if (refFillers > 0) row.findings.push(`Fillers: ${gotFillers} transcribed of ${refFillers} spoken (metrics report ${row.metricsFromTranscript.fillerCount}).`);
    if (row.metricsFromTranscript.wordCount < 0.8 * row.metricsFromRef.wordCount) row.findings.push(`Word count ${row.metricsFromTranscript.wordCount} vs ${row.metricsFromRef.wordCount} spoken: words were dropped.`);
    const echoOfPrompt = words.length > 0 && words.every((w) => PROMPT_WORDS.has(w)) && words.length >= 4;
    expect(echoOfPrompt, `${sample.id}: speech transcript is only prompt words`).toBe(false);
    if (sample.id === "T05-short") {
      row.findings.push(`Word count ${row.metricsFromTranscript.wordCount} (the pipeline treats fewer than 5 recognised words as insufficient speech).`);
    }
  });

  it.each((["m4a", "ogg"] as const).map((f) => [f]))("format check: the strong answer as %s", async (format) => {
    const file = await speechFile(FORMAT_SAMPLE_REF, format);
    const row: Row = {
      id: `T01-normal-b2 [${format}]`,
      description: `Same audio as T01, re-encoded as ${format} to check the container is accepted.`,
      format,
      mime: MIME_BY_FORMAT[format],
      audioSeconds: probeDurationSeconds(file),
      outcome: "transcribed",
      ref: FORMAT_SAMPLE_REF,
      keptErrors: [],
      findings: [],
    };
    rows.push(row);
    const { output, latencyMs } = await transcribeFile(file, format);
    row.latencyMs = latencyMs;
    row.transcript = output.text;
    row.usage = output.usage;
    row.wer = wordErrorRate(FORMAT_SAMPLE_REF, output.text);
  });

  it("writes the review report", () => {
    const speech = rows.filter((r) => r.transcript !== undefined && r.ref);
    const latencies = rows.flatMap((r) => (r.latencyMs ? [r.latencyMs] : []));
    const kept = rows.flatMap((r) => r.keptErrors);
    const sum = (key: string) => rows.reduce((total, r) => total + (typeof r.usage?.[key] === "number" ? (r.usage[key] as number) : 0), 0);
    const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
    const silence = rows.filter((r) => /silence/.test(r.id));
    const summary = [
      "",
      ...(endpointOverrides().length ? [`NOT A REAL RUN: ${endpointOverrides().join(", ")} point at a stand-in, not the provider.`] : []),
      "Provider: OpenAI transcription",
      `Model: ${provider().model}`,
      "Audio: synthetic speech (text-to-speech, ffmpeg-encoded) + generated silence; NOT real learner recordings",
      `Speech model for the audio: ${ttsLog.ttsRequests > 0 ? "OpenAI speech synthesis" : "cache (no synthesis this run)"}`,
      `Samples: ${rows.length}`,
      `Formats: ${[...new Set(rows.map((r) => r.mime))].join(", ")}`,
      `Transcribed: ${rows.filter((r) => r.outcome === "transcribed" && r.transcript !== undefined).length}`,
      `Rejected as empty/prompt-echo: ${rows.filter((r) => r.outcome === "rejected_empty").length}`,
      `Errors: ${rows.filter((r) => r.outcome === "error").length}`,
      `Median word error rate vs spoken text: ${speech.length ? `${(median(speech.map((r) => r.wer ?? 0)) * 100).toFixed(1)}%` : "n/a"}`,
      `Learner errors preserved: ${kept.filter((k) => k.kept).length} of ${kept.length}`,
      `Silence / near-silence passed (no fabricated or prompt-derived transcript): ${silence.length} of ${silence.length} (assertions are hard)`,
      `Transcription latency: avg ${latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1) : "n/a"}s, min ${latencies.length ? (Math.min(...latencies) / 1000).toFixed(1) : "n/a"}s, max ${latencies.length ? (Math.max(...latencies) / 1000).toFixed(1) : "n/a"}s`,
      `Transcription requests: ${rows.length}; usage reported by the API: input_tokens ${sum("input_tokens")}, output_tokens ${sum("output_tokens")}, seconds ${sum("seconds")}`,
      `Speech-synthesis requests this run: ${ttsLog.ttsRequests} (${ttsLog.ttsCharacters} characters)`,
      "",
    ].join("\n");
    console.log(summary);

    const md = [
      "# Controlled transcription validation (real OpenAI)",
      "",
      summary,
      "| Sample | Format | Audio | Latency | Outcome | WER | Learner errors kept | Fillers (metrics / ref) |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.id} | ${r.mime} | ${r.audioSeconds.toFixed(1)}s | ${r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"} | ${r.outcome}${r.errorCode ? ` (${r.errorCode})` : ""} | ${r.wer === undefined ? "—" : `${(r.wer * 100).toFixed(0)}%`} | ${r.keptErrors.length ? `${r.keptErrors.filter((k) => k.kept).length}/${r.keptErrors.length}` : "—"} | ${r.metricsFromTranscript ? `${r.metricsFromTranscript.fillerCount} / ${r.metricsFromRef?.fillerCount}` : "—"} |`,
      ),
      "",
      ...rows.flatMap((r) => [
        `## ${r.id}`,
        "",
        r.description,
        "",
        ...(r.ref ? ["**Spoken (reference):**", "", `> ${r.ref}`, ""] : []),
        "**Transcribed:**",
        "",
        `> ${r.transcript ?? "(none)"}`,
        "",
        ...(r.keptErrors.length ? ["Learner errors: " + r.keptErrors.map((k) => `${k.kept ? "✓" : "✗"} "${k.phrase}"`).join(", "), ""] : []),
        ...(r.metricsFromTranscript && r.metricsFromRef
          ? [
              `Metrics (from transcript → from spoken text): words ${r.metricsFromTranscript.wordCount} → ${r.metricsFromRef.wordCount}, fillers ${r.metricsFromTranscript.fillerCount} → ${r.metricsFromRef.fillerCount}, repeated words ${JSON.stringify(r.metricsFromTranscript.repeatedWords ?? [])} → ${JSON.stringify(r.metricsFromRef.repeatedWords ?? [])}`,
              "",
            ]
          : []),
        ...(r.usage ? [`API usage: ${JSON.stringify(r.usage)}`, ""] : []),
        ...r.findings.map((f) => `- ${f}`),
        "",
      ]),
    ].join("\n");
    console.log(`\nReview report: ${writeReport("controlled-transcription", md, rows)}\n`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
