import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { evidenceTokens, isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { computeSpeechMetrics, type SpeechMetrics } from "@/domain/speaking/metrics";
import { ProviderError } from "@/server/errors";
import { getTranscriptionProvider } from "@/server/transcription";
import { GEMINI_TRANSCRIPTION_PROMPT } from "@/server/transcription/gemini-transcription";
import { VERBATIM_TRANSCRIPTION_PROMPT } from "@/server/transcription/openai-transcription";
import {
  MIME_BY_FORMAT,
  ffmpegAvailable,
  makeNearSilence,
  makeNoise,
  makeSilence,
  pausedSpeechFile,
  attenuatedWav,
  synthesizeSpeechWav,
  encodeAudio,
  probeDurationSeconds,
  speechFile,
  ttsLog,
  ttsProvider,
  type AudioFormat,
} from "./audio";
import { endpointOverrides, wordErrorRate } from "./checks";
import { FORMAT_SAMPLE_REF, TRANSCRIPTION_SAMPLES } from "./audio-samples";
import { transcriptionSelection } from "./providers";
import { writeReport } from "./report";
import { ffmpegSpeechGuard } from "@/server/audio/speech-guard";

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
const task = getSpeakingTask("b2-part2-advice-from-someone")!;
const selection = transcriptionSelection();
const configured = selection.configured && ffmpegAvailable();
if (!configured) console.log("\nLIVE controlled transcription skipped: needs TRANSCRIPTION_PROVIDER=openai|gemini with its API key, and ffmpeg/ffprobe.\n");

interface Row {
  id: string;
  description: string;
  format: AudioFormat;
  mime: string;
  audioSeconds: number;
  latencyMs?: number;
  transcript?: string;
  outcome: "transcribed" | "rejected_empty" | "blocked_by_guard" | "error";
  /** Speech Activity Guard measurements (it runs before the provider). */
  guard?: { hasSpeech: boolean; reason: string; activeSeconds: number; noiseFloorDb: number; loudDb: number; decodeMs: number; analyseMs: number };
  errorCode?: string;
  usage?: Record<string, number | string>;
  ref?: string;
  wer?: number;
  keptErrors: { phrase: string; kept: boolean }[];
  metricsFromTranscript?: SpeechMetrics;
  metricsFromRef?: SpeechMetrics;
  findings: string[]; // things to read, not necessarily failures
}

const onlySamples = (process.env.TRANSCRIPTION_SAMPLES ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const PROMPT_WORDS = new Set(evidenceTokens(selection.provider === "gemini" ? GEMINI_TRANSCRIPTION_PROMPT : VERBATIM_TRANSCRIPTION_PROMPT));
const FILLER_RE = /\b(um+|uh+|er+m?|hmm+)\b/gi;

async function sampleFile(sample: (typeof TRANSCRIPTION_SAMPLES)[number], format: AudioFormat): Promise<string> {
  switch (sample.kind) {
    case "silence":
      return makeSilence(sample.seconds ?? 8, format);
    case "near_silence":
      return makeNearSilence(sample.seconds ?? 8, format);
    case "noise":
      return makeNoise(sample.id, sample.noise!.color, sample.noise!.amplitude, sample.seconds ?? 8, format);
    default:
      if (sample.pauses) return pausedSpeechFile(sample.pauses.chunks, sample.pauses, format);
      if (sample.quietDb !== undefined) return encodeAudio(attenuatedWav(await synthesizeSpeechWav(sample.ref!), sample.quietDb), format);
      return speechFile(sample.ref!, format);
  }
}

describe.skipIf(!configured)(`LIVE: ${selection.provider} transcription on controlled audio`, () => {
  const rows: Row[] = [];
  const provider = () => getTranscriptionProvider();
  let providerCalls = 0; // every real transcription request made by this suite

  async function transcribeFile(file: string, format: AudioFormat) {
    providerCalls += 1;
    const started = Date.now();
    const output = await provider().transcribe({ audio: fs.readFileSync(file), mimeType: MIME_BY_FORMAT[format], language: "en" });
    return { output, latencyMs: Date.now() - started };
  }

  it.each(TRANSCRIPTION_SAMPLES.filter((s) => onlySamples.length === 0 || onlySamples.some((p) => s.id.startsWith(p))).map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    const format: AudioFormat = "webm"; // the format the browser recorder produces
    const callsAtStart = providerCalls;
    const file = await sampleFile(sample, format);
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

    // The Speech Activity Guard decides first, from the audio signal, exactly as the pipeline does.
    const activity = await ffmpegSpeechGuard.check({ audio: fs.readFileSync(file), mimeType: MIME_BY_FORMAT[format] });
    row.guard = {
      hasSpeech: activity.hasSpeech,
      reason: activity.reason,
      activeSeconds: Math.round(activity.activeSeconds * 100) / 100,
      noiseFloorDb: Math.round(activity.noiseFloorDb),
      loudDb: Math.round(activity.loudDb),
      decodeMs: activity.decodeMs,
      analyseMs: activity.analyseMs,
    };
    if (!activity.hasSpeech) {
      expect(sample.kind, `${sample.id}: the guard blocked real speech (${activity.reason})`).not.toBe("speech");
      row.outcome = "blocked_by_guard";
      row.findings.push(`Blocked by the Speech Activity Guard (${activity.reason}) before any provider call.`);
      expect(providerCalls, `${sample.id}: the provider was called for blocked audio`).toBe(callsAtStart);
      return;
    }
    if (sample.kind !== "speech") {
      row.findings.push("The guard let this non-speech audio through; it is NOT sent to the provider so no transcript can be invented, and the test fails.");
      expect.fail(`${sample.id}: the Speech Activity Guard let non-speech audio (${sample.kind}) through (${activity.reason}, ${activity.activeSeconds.toFixed(2)} s active)`);
    }

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

    const transcript = row.transcript!;
    row.wer = wordErrorRate(sample.ref!, transcript);
    row.keptErrors = (sample.keep ?? []).map((phrase) => ({ phrase, kept: isQuoteInTranscript(phrase, transcript, { strict: true }) }));
    row.metricsFromTranscript = computeSpeechMetrics(transcript, row.audioSeconds * 1000, task.speakingSeconds);
    row.metricsFromRef = computeSpeechMetrics(sample.ref!, row.audioSeconds * 1000, task.speakingSeconds);

    const lost = row.keptErrors.filter((k) => !k.kept).map((k) => k.phrase);
    if (lost.length) row.findings.push(`Learner errors NOT preserved: ${lost.join("; ")}`);
    const lostWatched = (sample.watch ?? []).filter((phrase) => !isQuoteInTranscript(phrase, transcript, { strict: true }));
    if (lostWatched.length) row.findings.push(`Other learner errors changed (review): ${lostWatched.join("; ")}`);
    if (sample.mustKeep) expect(lost, `${sample.id}: the transcript changed the learner's words (got: "${transcript}")`).toEqual([]);
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
    const nonSpeech = rows.filter((r) => /silence|noise/.test(r.id));
    const blocked = rows.filter((r) => r.outcome === "blocked_by_guard");
    const guardMs = rows.flatMap((r) => (r.guard ? [r.guard.decodeMs + r.guard.analyseMs] : []));
    const summary = [
      "",
      ...(endpointOverrides().length ? [`NOT A REAL RUN: ${endpointOverrides().join(", ")} point at a stand-in, not the provider.`] : []),
      `Provider: ${provider().name} transcription`,
      `Model: ${provider().model}`,
      "Audio: synthetic speech (text-to-speech, ffmpeg-encoded) + generated silence; NOT real learner recordings",
      `Speech model for the audio: ${ttsLog.ttsRequests > 0 ? `${ttsProvider()} speech synthesis` : "cache (no synthesis this run)"}`,
      `Samples: ${rows.length}`,
      `Formats: ${[...new Set(rows.map((r) => r.mime))].join(", ")}`,
      `Transcribed: ${rows.filter((r) => r.outcome === "transcribed" && r.transcript !== undefined).length}`,
      `Rejected by the provider as empty/prompt-echo: ${rows.filter((r) => r.outcome === "rejected_empty").length}`,
      `Errors: ${rows.filter((r) => r.outcome === "error").length}`,
      `Median word error rate vs spoken text: ${speech.length ? `${(median(speech.map((r) => r.wer ?? 0)) * 100).toFixed(1)}%` : "n/a"}`,
      `Learner errors preserved: ${kept.filter((k) => k.kept).length} of ${kept.length}`,
      `Speech Activity Guard: blocked ${blocked.length} of ${nonSpeech.length} non-speech sample(s) before any provider call (${nonSpeech.map((r) => r.id).join(", ") || "none"}); provider calls made by this suite: ${providerCalls}`,
      `Guard overhead per recording (decode + analysis): avg ${guardMs.length ? Math.round(guardMs.reduce((a, b) => a + b, 0) / guardMs.length) : "n/a"} ms, max ${guardMs.length ? Math.max(...guardMs) : "n/a"} ms`,
      `Transcription latency: avg ${latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1) : "n/a"}s, min ${latencies.length ? (Math.min(...latencies) / 1000).toFixed(1) : "n/a"}s, max ${latencies.length ? (Math.max(...latencies) / 1000).toFixed(1) : "n/a"}s`,
      `Transcription requests: ${providerCalls}; usage reported by the API: input_tokens ${sum("input_tokens")}, output_tokens ${sum("output_tokens")}, seconds ${sum("seconds")}`,
      `Speech-synthesis requests this run: ${ttsLog.ttsRequests} (${ttsLog.ttsCharacters} characters)`,
      "",
    ].join("\n");
    console.log(summary);

    const md = [
      `# Controlled transcription validation (real ${provider().name})`,
      "",
      summary,
      "| Sample | Format | Audio | Guard (speech? / active s / floor dB / loud dB) | Latency | Outcome | WER | Learner errors kept | Fillers (metrics / ref) |",
      "|---|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.id} | ${r.mime} | ${r.audioSeconds.toFixed(1)}s | ${r.guard ? `${r.guard.hasSpeech ? "yes" : `NO (${r.guard.reason})`} / ${r.guard.activeSeconds} / ${r.guard.noiseFloorDb} / ${r.guard.loudDb}` : "—"} | ${r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"} | ${r.outcome}${r.errorCode ? ` (${r.errorCode})` : ""} | ${r.wer === undefined ? "—" : `${(r.wer * 100).toFixed(0)}%`} | ${r.keptErrors.length ? `${r.keptErrors.filter((k) => k.kept).length}/${r.keptErrors.length}` : "—"} | ${r.metricsFromTranscript ? `${r.metricsFromTranscript.fillerCount} / ${r.metricsFromRef?.fillerCount}` : "—"} |`,
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
