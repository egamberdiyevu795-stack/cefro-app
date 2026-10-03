import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { compareAttempts } from "@/domain/speaking/comparison";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { MAX_AUDIO_BYTES, createAttempt, getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { processAttempt } from "@/server/attempts/attempt-processing";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { analyticsEvents, evaluations, practiceSessions, recordings, speakingAttempts, transcripts, users } from "@/server/db/schema";
import { getEvaluationModel, setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { EVALUATOR_VERSION } from "@/server/evaluation/versions";
import { createPracticeSession } from "@/server/sessions/session-service";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { getTranscriptionProvider, setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { endpointOverrides, evidenceViolations, numericClaimMismatches, wordErrorRate } from "./checks";
import { MIME_BY_FORMAT, ffmpegAvailable, makeNearSilence, makeSilence, pausedSpeechFile, probeDurationSeconds, speechFile, ttsLog, ttsProvider } from "./audio";
import { PIPELINE_SAMPLES, pipelineText, threeParts, type PipelineSample } from "./audio-samples";
import { evaluatorSelection, transcriptionSelection } from "./providers";
import { writeReport } from "./report";

/**
 * REAL end-to-end pipeline validation through the application's own services:
 *
 *   audio file → createAttempt (validation, storage, session) → processAttempt: OpenAI transcription → speech metrics
 *   → Gemini evaluation → schema → quality gate → regeneration if needed → persistence → read the attempt back.
 *
 * Only the browser and HTTP layers are not involved (the real-provider browser test covers them). The providers are
 * whatever the environment configures, wrapped only to record latency and usage; no result is altered.
 *
 *   TRANSCRIPTION_PROVIDER=openai OPENAI_API_KEY=... EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:pipeline
 *   EVAL_SAMPLES=P1,P2 npm run eval:pipeline      # subset (a retry needs its first attempt)
 *
 * The audio is synthetic speech (see audio.ts). Integrity violations (a quote that is not in the transcript, a broken
 * link between records) fail the run; quality observations (levels, numeric-claim mismatches) are reported for review.
 */
const selection = evaluatorSelection();
const sttSelection = transcriptionSelection();
const configured = selection.configured && sttSelection.configured && ffmpegAvailable();
if (!configured) console.log("\nLIVE full pipeline skipped: needs the transcription provider key + the evaluation provider key + ffmpeg/ffprobe.\n");

const only = process.env.EVAL_SAMPLES?.split(",").map((s) => s.trim());
const samples = PIPELINE_SAMPLES.filter((s) => !only || only.some((p) => s.id.startsWith(p) || s.retryOf?.startsWith(p)));
const TASK_ID = "b2-part2-technology-young-people";
const USER = "5e1f0000-0000-4000-8000-000000000001";

interface Row {
  sample: PipelineSample;
  format: string;
  audioSeconds: number;
  attemptId?: string;
  status?: string;
  failure?: string;
  transcript?: string;
  words?: number;
  wer?: number;
  sttMs?: number;
  sttUsage?: Record<string, number | string>;
  evalMs?: number;
  evalModel?: string;
  provider?: string;
  level?: string;
  scores?: string;
  modelCalls?: number;
  gateWarnings: string[];
  rejectedDrafts: string[];
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalMs?: number;
  integrity: string[];
  review: string[];
  result?: EvaluationResult;
  metrics?: SpeechMetrics | null;
  retryVerdict?: string;
}

describe.skipIf(!configured)(`LIVE: full pipeline (audio → ${sttSelection.provider} → ${selection.provider} → gate → database)`, () => {
  const rows: Row[] = [];
  const sttCalls: { ms: number; usage?: Record<string, number | string>; ok: boolean }[] = [];
  const evalCalls: { ms: number; ok: boolean }[] = [];
  const attemptBySample = new Map<string, { id: string; sessionId: string; view: ReturnType<typeof getAttemptViewForUser> }>();
  let storage: LocalAudioStorage;
  let db: ReturnType<typeof openDatabase>;
  let provider: TranscriptionProvider;
  let model: EvaluationModel;

  const guidedTexts = new Map<string, string>();

  /** Synthetic learner: rewrites a transcript applying only the given retry objectives (uses the Gemini key). */
  async function guidedRewrite(transcript: string, objectives: string[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("the guided-retry sample needs GEMINI_API_KEY");
    const prompt =
      "You simulate a B2 English learner who has just received feedback and records a second attempt. Rewrite the spoken answer below " +
      "so that it applies ONLY the retry objectives listed, keeping the same ideas, the same speaking style and any other mistakes the learner made. " +
      "Do not fix anything the objectives do not mention. Keep it a natural spoken answer of similar length (it may grow a little). " +
      `Reply with the rewritten answer only.\n\nRetry objectives:\n${objectives.map((o) => `- ${o}`).join("\n")}\n\nFirst answer:\n${transcript}`;
    const model = process.env.GEMINI_EVALUATION_MODEL || "gemini-3.8-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`guided rewrite failed: HTTP ${response.status}`);
    const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!out) throw new Error("guided rewrite returned no text");
    return out;
  }

  it("sets up a throwaway database and storage, with the real providers wrapped for measurement", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-pipeline-"));
    db = openDatabase(path.join(dir, "pipeline.db"));
    setDbForTesting(db);
    storage = new LocalAudioStorage(path.join(dir, "audio"));
    setAudioStorageForTesting(storage);
    db.insert(users).values({ id: USER }).run();

    const realStt = getTranscriptionProvider();
    provider = {
      name: realStt.name,
      model: realStt.model,
      async transcribe(input) {
        const started = Date.now();
        try {
          const out = await realStt.transcribe(input);
          sttCalls.push({ ms: Date.now() - started, usage: out.usage, ok: true });
          return out;
        } catch (error) {
          sttCalls.push({ ms: Date.now() - started, ok: false });
          throw error;
        }
      },
    };
    setTranscriptionProviderForTesting(provider);

    const realEval = getEvaluationModel();
    model = {
      provider: realEval.provider,
      model: realEval.model,
      isDevelopmentProvider: realEval.isDevelopmentProvider,
      config: realEval.config,
      async evaluate(prompt, input) {
        const started = Date.now();
        try {
          const out = await realEval.evaluate(prompt, input);
          evalCalls.push({ ms: Date.now() - started, ok: true });
          return out;
        } catch (error) {
          evalCalls.push({ ms: Date.now() - started, ok: false });
          throw error;
        }
      },
    };
    setEvaluationModelForTesting(model);
    expect(model.isDevelopmentProvider).toBe(false);
    expect(provider.name).not.toBe("mock");
  });

  it.each(samples.map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    let text = pipelineText(sample);
    if (sample.guided) {
      const first = sample.retryOf ? attemptBySample.get(sample.retryOf) : undefined;
      if (!first) {
        rows.push({ sample, format: MIME_BY_FORMAT.webm, audioSeconds: 0, gateWarnings: [], rejectedDrafts: [], integrity: [], review: [], status: "not_run", failure: `its first attempt ${sample.retryOf} did not complete` });
        return;
      }
      text = await guidedRewrite(first.view.transcript!.text, first.view.evaluation!.result.retry_focus.map((f) => f.objective));
      guidedTexts.set(sample.id, text);
    }
    const file = sample.pauses ? await pausedSpeechFile(threeParts(text), { lead: 4, gap: 3, trail: 4 }, "webm") : await speechFile(text, "webm");
    const audio = fs.readFileSync(file);
    expect(audio.byteLength).toBeLessThan(MAX_AUDIO_BYTES);
    const audioSeconds = probeDurationSeconds(file);
    const row: Row = { sample, format: MIME_BY_FORMAT.webm, audioSeconds, gateWarnings: [], rejectedDrafts: [], integrity: [], review: [] };
    rows.push(row);
    if (sample.guided) row.review.push(`Spoken text (synthetic guided retry): ${text}`);

    const previous = sample.retryOf ? attemptBySample.get(sample.retryOf) : undefined;
    if (sample.retryOf && !previous) {
      row.status = "not_run";
      row.failure = `its first attempt ${sample.retryOf} did not complete`;
      return;
    }
    const sessionId = previous?.sessionId ?? createPracticeSession(USER);

    const startedAt = Date.now();
    const created = await createAttempt({
      userId: USER,
      taskId: TASK_ID,
      audio,
      mimeType: MIME_BY_FORMAT.webm,
      durationMs: Math.round(audioSeconds * 1000),
      previousAttemptId: previous?.id ?? null,
      sessionId,
    });
    row.attemptId = created.id;
    await processAttempt(created.id);
    row.totalMs = Date.now() - startedAt;

    // Read it back the way the API does.
    const view = getAttemptViewForUser(USER, created.id);
    row.status = view.status;
    row.transcript = view.transcript?.text;
    row.metrics = view.metrics;
    row.words = view.metrics?.wordCount;
    if (view.transcript) row.wer = wordErrorRate(text, view.transcript.text);
    if (view.status !== "completed" || !view.evaluation) {
      row.failure = `${view.failure?.stage ?? "?"}/${view.failure?.code ?? "unknown"}`;
      checkRecordsAfterFailure(row, created.id);
      return;
    }
    attemptBySample.set(sample.id, { id: created.id, sessionId, view });

    const result = view.evaluation.result;
    row.result = result;
    row.level = result.overall_level;
    row.scores = Object.entries(result.criteria)
      .map(([k, c]) => `${k.split("_")[0].slice(0, 4)} ${c.assessable ? c.score : "n/a"}`)
      .join(", ");

    await checkPersistence(row, created.id, sessionId, audio, previous?.id ?? null);
    checkEvidence(row, result, view.transcript!.text);
    checkNumericClaims(row, result, view.metrics!, audioSeconds);

    if (previous) {
      const comparison = compareAttempts(
        { evaluation: previous.view.evaluation!.result, metrics: previous.view.metrics },
        { evaluation: result, metrics: view.metrics },
      );
      row.retryVerdict = `${comparison.verdict} (${comparison.overall.before} → ${comparison.overall.after}); focus ${JSON.stringify(comparison.focus)}`;
      if (!result.retry_review) row.integrity.push("retry attempt has no retry_review");
      const given = previous.view.evaluation!.result.retry_focus.length;
      if (result.retry_review && result.retry_review.objectives.length !== given) {
        row.review.push(`retry_review lists ${result.retry_review.objectives.length} objective(s) for ${given} focus item(s) given`);
      }
    } else if (result.retry_review) {
      row.integrity.push("first attempt has a retry_review");
    }

    expect(row.integrity, `${sample.id}: integrity violations`).toEqual([]);
    expect(row.wer ?? 1, `${sample.id}: transcript does not correspond to the audio`).toBeLessThan(0.6);
  });

  async function checkPersistence(row: Row, attemptId: string, sessionId: string, audio: Buffer, previousId: string | null) {
    const bad = (message: string) => row.integrity.push(message);
    const attempt = db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
    const session = db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get();
    const recording = db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get();
    const transcript = db.select().from(transcripts).where(eq(transcripts.attemptId, attemptId)).get();
    const evaluation = db.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).get();
    if (!attempt || !session || !recording || !transcript || !evaluation) return bad("a linked record is missing (user → session → attempt → recording → transcript → evaluation)");

    if (attempt.userId !== USER || session.userId !== USER) bad("session/attempt not owned by the user");
    if (attempt.sessionId !== sessionId) bad("attempt is not linked to its session");
    if (attempt.status !== "completed" || !attempt.completedAt) bad("attempt not marked completed");
    if (!attempt.processingDurationMs || attempt.processingDurationMs <= 0) bad("processing duration not recorded");
    if (attempt.previousAttemptId !== previousId) bad("retry link wrong");
    if (previousId && !attempt.retryFocus) bad("retry focus snapshot missing on a retry");
    if (!attempt.metrics) bad("metrics not stored");
    if (recording.mimeType !== "audio/webm" || recording.sizeBytes !== audio.byteLength) bad("recording row does not describe the uploaded audio");
    try {
      const stored = await storage.read(recording.storageKey);
      if (!stored.equals(audio)) bad("stored audio differs from the uploaded audio");
    } catch {
      bad("stored audio file is missing");
    }
    if (transcript.provider !== sttSelection.provider) bad(`transcript provider recorded as ${transcript.provider}`);
    if (transcript.model.length === 0 || !transcript.latencyMs) bad("transcript model/latency not recorded");
    if (evaluation.transcriptId !== transcript.id) bad("evaluation does not point at the transcript");
    if (evaluation.evaluatorVersion !== EVALUATOR_VERSION) bad(`evaluator version ${evaluation.evaluatorVersion}`);
    if (evaluation.rubricVersion !== "b2-speaking-rubric/1.0.0") bad(`rubric version ${evaluation.rubricVersion}`);
    if (evaluation.schemaVersion !== 2) bad(`schema version ${evaluation.schemaVersion}`);
    if (!/^h2:[a-f0-9]{64}$/.test(evaluation.promptHash)) bad("prompt hash not in h2 format");
    if (evaluation.provider !== selection.provider || !evaluation.model) bad("evaluation provider/model not recorded");
    if (!evaluation.modelConfig || !evaluation.qualityReport) bad("model config or quality report not stored");
    if (!evaluation.modelCalls || evaluation.modelCalls < 1 || evaluation.modelCalls > 2) bad(`model calls ${evaluation.modelCalls}`);
    if (!evaluation.latencyMs) bad("evaluation latency not stored");

    const events = db.select().from(analyticsEvents).where(eq(analyticsEvents.attemptId, attemptId)).all();
    const names = events.map((e) => e.name);
    for (const expected of ["recording_submitted", "transcription_started", "transcription_completed", "evaluation_started", "evaluation_completed"]) {
      if (!names.includes(expected)) bad(`analytics event ${expected} missing`);
    }
    if (events.some((e) => e.sessionId !== sessionId)) bad("an analytics event is not correlated with the session");

    row.evalMs = evaluation.latencyMs ?? undefined;
    row.sttMs = transcript.latencyMs ?? undefined;
    row.sttUsage = sttCalls.at(-1)?.usage;
    row.evalModel = evaluation.model;
    row.provider = evaluation.provider;
    row.modelCalls = evaluation.modelCalls ?? undefined;
    row.inputTokens = evaluation.inputTokens;
    row.outputTokens = evaluation.outputTokens;
    const report = evaluation.qualityReport as { warnings?: { code: string; path: string }[]; rejectedDrafts?: { code: string; path: string; message: string }[][] };
    row.gateWarnings = (report.warnings ?? []).map((w) => `${w.code}@${w.path}`);
    row.rejectedDrafts = (report.rejectedDrafts ?? []).flat().map((v) => `${v.code}@${v.path}: ${v.message.slice(0, 200)}`);
  }

  /** A failed attempt must be a clean, restartable state: audio kept, no half-written evaluation, nothing dangling. */
  function checkRecordsAfterFailure(row: Row, attemptId: string) {
    const attempt = db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
    const recording = db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get();
    const evaluation = db.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).get();
    if (!attempt || attempt.status !== "failed" || !attempt.failureCode) row.integrity.push("failed attempt not stored as failed with a code");
    if (!recording) row.integrity.push("failed attempt lost its recording");
    if (evaluation) row.integrity.push("failed attempt has an evaluation row");
    row.review.push(`Failed: ${row.failure}. State: status=${attempt?.status}, runs=${attempt?.processingRuns}, audio kept=${Boolean(recording)}, evaluation row=${Boolean(evaluation)}.`);
  }

  function checkEvidence(row: Row, result: EvaluationResult, transcript: string) {
    row.integrity.push(...evidenceViolations(result, transcript));
  }

  function checkNumericClaims(row: Row, result: EvaluationResult, metrics: SpeechMetrics, audioSeconds: number) {
    row.review.push(...numericClaimMismatches(result, metrics, audioSeconds));
  }

  const guardRows: string[] = [];

  it.each([
    ["silence", () => makeSilence(8, "webm")],
    ["near-silence", () => makeNearSilence(8, "webm")],
  ])("%s is stopped by the Speech Activity Guard before transcription: no provider call, no transcript, no evaluation", async (label, make) => {
    const file = make();
    const audio = fs.readFileSync(file);
    const sttBefore = sttCalls.length;
    const evalBefore = evalCalls.length;
    const created = await createAttempt({
      userId: USER,
      taskId: TASK_ID,
      audio,
      mimeType: MIME_BY_FORMAT.webm,
      durationMs: 8000,
      previousAttemptId: null,
      sessionId: createPracticeSession(USER),
    });
    await processAttempt(created.id);
    const view = getAttemptViewForUser(USER, created.id);
    const transcriptRows = db.select().from(transcripts).where(eq(transcripts.attemptId, created.id)).all();
    const evaluationRows = db.select().from(evaluations).where(eq(evaluations.attemptId, created.id)).all();
    guardRows.push(
      `${label}: transcription requests ${sttCalls.length - sttBefore}, evaluation requests ${evalCalls.length - evalBefore}, failure ${view.failure?.stage}/${view.failure?.code}, transcript rows ${transcriptRows.length}, evaluation rows ${evaluationRows.length}`,
    );

    expect(sttCalls.length - sttBefore, `${label}: the transcription provider was called`).toBe(0);
    expect(evalCalls.length - evalBefore, `${label}: the evaluator was called`).toBe(0);
    expect(view.status).toBe("failed");
    expect(view.failure).toEqual({ stage: "transcription", code: "transcription_empty" });
    expect(transcriptRows).toHaveLength(0);
    expect(evaluationRows).toHaveLength(0);
  });

  it("writes the review report", () => {
    const done = rows.filter((r) => r.status === "completed");
    const failed = rows.filter((r) => r.status !== "completed");
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const stt = sttCalls.map((c) => c.ms);
    const evalMs = done.flatMap((r) => (r.evalMs ? [r.evalMs] : []));
    const usageSum = (key: string) => sttCalls.reduce((t, c) => t + (typeof c.usage?.[key] === "number" ? (c.usage[key] as number) : 0), 0);
    const regenerations = done.reduce((t, r) => t + ((r.modelCalls ?? 1) - 1), 0);
    const summary = [
      "",
      ...(endpointOverrides().length ? [`NOT A REAL RUN: ${endpointOverrides().join(", ")} point at a stand-in, not the provider.`] : []),
      `Transcription: ${provider.name} / ${provider.model} (real)`,
      `Evaluation: ${model.provider} / models answered: ${[...new Set(done.map((r) => r.evalModel))].join(", ") || "n/a"} (real)`,
      ...(guidedTexts.size ? [`Guided retry text (synthetic, generated from the first attempt's retry focus): ${[...guidedTexts.keys()].join(", ")}`] : []),
      ...guardRows.map((r) => `Speech Activity Guard, ${r}`),
      "Audio: synthetic speech through the browser's WebM/Opus format; not real learner recordings",
      `Samples: ${rows.length}`,
      `Completed end to end: ${done.length}`,
      `Failed or not run: ${failed.length}${failed.length ? ` (${failed.map((r) => `${r.sample.id}: ${r.failure ?? r.status}`).join("; ")})` : ""}`,
      `Integrity violations: ${rows.reduce((t, r) => t + r.integrity.length, 0)}`,
      `Items for review (numeric claims, retry review shape, failures): ${rows.reduce((t, r) => t + r.review.length, 0)}`,
      `Regenerations: ${regenerations}`,
      `Quality-gate rejected drafts: ${rows.reduce((t, r) => t + r.rejectedDrafts.length, 0)}`,
      `${provider.name} transcription: ${sttCalls.length} request(s), avg ${(avg(stt) / 1000).toFixed(1)}s, min ${stt.length ? (Math.min(...stt) / 1000).toFixed(1) : "n/a"}s, max ${stt.length ? (Math.max(...stt) / 1000).toFixed(1) : "n/a"}s; usage reported: input_tokens ${usageSum("input_tokens")}, output_tokens ${usageSum("output_tokens")}, seconds ${usageSum("seconds")}`,
      `${ttsProvider()} speech synthesis for the test audio: ${ttsLog.ttsRequests} request(s), ${ttsLog.ttsCharacters} characters${ttsLog.ttsRequests === 0 ? " (all from cache)" : ""}`,
      `${model.provider} evaluation: ${evalCalls.length} request(s), avg stage latency ${(avg(evalMs) / 1000).toFixed(1)}s, tokens in/out ${done.reduce((t, r) => t + (r.inputTokens ?? 0), 0)}/${done.reduce((t, r) => t + (r.outputTokens ?? 0), 0)}`,
      `Total processing per attempt: avg ${(avg(rows.flatMap((r) => (r.totalMs ? [r.totalMs] : []))) / 1000).toFixed(1)}s`,
      "",
    ].join("\n");
    console.log(summary);

    const md = [
      `# Full pipeline validation (real ${provider.name} transcription + real ${model.provider} evaluation)`,
      "",
      summary,
      "| Sample | Format | Audio | STT | WER | Words | Eval | Model | Level | Calls | Gate | Total | Status |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.sample.id} | ${r.format} | ${r.audioSeconds.toFixed(0)}s | ${r.sttMs ? `${(r.sttMs / 1000).toFixed(1)}s` : "—"} | ${r.wer === undefined ? "—" : `${(r.wer * 100).toFixed(0)}%`} | ${r.words ?? "—"} | ${r.evalMs ? `${(r.evalMs / 1000).toFixed(1)}s` : "—"} | ${r.evalModel ?? "—"} | ${r.level ?? "—"} | ${r.modelCalls ?? "—"} | ${r.gateWarnings.length ? r.gateWarnings.join(", ") : "—"} | ${r.totalMs ? `${(r.totalMs / 1000).toFixed(1)}s` : "—"} | ${r.status}${r.failure ? ` (${r.failure})` : ""} |`,
      ),
      "",
      ...rows.flatMap((r) => {
        const result = r.result;
        return [
          `## ${r.sample.id}: ${r.sample.description}`,
          "",
          `Attempt ${r.attemptId ?? "—"}; scores: ${r.scores ?? "—"}; tokens in/out ${r.inputTokens ?? "—"}/${r.outputTokens ?? "—"}; STT usage ${JSON.stringify(r.sttUsage ?? {})}`,
          "",
          "**Transcript:**",
          "",
          `> ${r.transcript ?? "(none)"}`,
          "",
          ...(r.metrics ? [`Metrics: ${JSON.stringify({ words: r.metrics.wordCount, seconds: r.metrics.speakingSeconds, wpm: r.metrics.wordsPerMinute, fillers: r.metrics.fillerCount, repeatedWords: r.metrics.repeatedWords, timeUsed: r.metrics.timeUsedRatio })}`, ""] : []),
          ...(result
            ? [
                `**${result.overall_level}**: ${result.overall_summary}`,
                "",
                "Issues:",
                ...result.issues.map((i, n) => `${n + 1}. [${i.severity} · ${i.criterion} · ${i.evidence_basis}] ${i.problem}\n   - Evidence: ${i.evidence_quotes.map((q) => `“${q}”`).join(", ") || "—"}\n   - Fix: ${i.how_to_fix}\n   - Better: “${i.improved_example.original}” → “${i.improved_example.improved}”`),
                "",
                "Retry focus: " + result.retry_focus.map((f) => `${f.objective} (issue ${f.addresses_issue})`).join(" | "),
                "",
                ...(result.retry_review ? ["Retry review:", ...result.retry_review.objectives.map((o) => `- ${o.outcome}: ${o.objective} — ${o.evidence}`), `Summary: ${result.retry_review.summary}`, ""] : []),
                ...(result.reliability_note ? [`Reliability note: ${result.reliability_note}`, ""] : []),
              ]
            : []),
          ...(r.retryVerdict ? [`Comparison with the first attempt: ${r.retryVerdict}`, ""] : []),
          ...(r.rejectedDrafts.length ? ["Rejected drafts:", ...r.rejectedDrafts.map((d) => `- ${d}`), ""] : []),
          ...(r.integrity.length ? ["**Integrity violations:**", ...r.integrity.map((d) => `- ${d}`), ""] : []),
          ...(r.review.length ? ["For review:", ...r.review.map((d) => `- ${d}`), ""] : []),
        ];
      }),
    ].join("\n");
    console.log(`\nReview report: ${writeReport("full-pipeline", md, rows.map((r) => ({ ...r, result: undefined })))}\n`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("no sample failed and nothing is inconsistent", () => {
    expect(rows.filter((r) => r.status !== "completed").map((r) => `${r.sample.id}: ${r.failure ?? r.status}`)).toEqual([]);
    expect(rows.flatMap((r) => r.integrity.map((i) => `${r.sample.id}: ${i}`))).toEqual([]);
  });
});
