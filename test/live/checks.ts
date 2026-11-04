import { evidenceTokens, isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { findPronunciationClaim } from "@/server/evaluation/quality-gate";

/** Checks applied to every real evaluation in the live pipeline validation. Pure, so they are unit-tested (test/pipeline-checks.test.ts). */

export function studentTexts(result: MultilevelResult): { field: string; text: string }[] {
  const a = result.assessment;
  return [
    ...a.questions.map((q) => ({ field: `questions[${q.id}].note`, text: q.note })),
    ...a.questions.filter((q) => q.model_answer).map((q) => ({ field: `questions[${q.id}].model_answer`, text: q.model_answer })),
    ...a.error_patterns.map((p, i) => ({ field: `error_patterns[${i}]`, text: `${p.name}. ${p.rule} ${p.how_to_fix}` })),
    ...FEATURES.flatMap((f) => [
      { field: `features.${f}.note`, text: a.features[f].note },
      { field: `features.${f}.how_to_improve`, text: `${a.features[f].how_to_improve} ${a.features[f].how_to_check}` },
    ]),
    ...a.strengths.map((s, i) => ({ field: `strengths[${i}]`, text: s.note })),
    ...result.retry_focus.map((f, i) => ({ field: `retry_focus[${i}]`, text: `${f.objective} ${f.success_check}` })),
    ...(a.retry_review
      ? [
          { field: "retry_review.summary", text: a.retry_review.summary },
          ...a.retry_review.objectives.map((o, i) => ({ field: `retry_review[${i}]`, text: `${o.objective} ${o.evidence}` })),
        ]
      : []),
  ];
}

/** Evidence that must be true by construction: every quote is the student's exact words; pronunciation only from audio. */
export function evidenceViolations(result: MultilevelResult, transcript: string): string[] {
  const out: string[] = [];
  const check = (where: string, quote: string) => {
    if (quote && !isQuoteInTranscript(quote, transcript, { strict: true })) out.push(`${where} quote not in transcript: "${quote}"`);
  };
  const a = result.assessment;
  a.questions.forEach((q) => check(`questions[${q.id}]`, q.evidence));
  for (const f of FEATURES) a.features[f].evidence.forEach((quote) => check(`features.${f}`, quote));
  a.errors.forEach((e, i) => check(`errors[${i}]`, e.quote));
  a.strengths.forEach((s, i) => check(`strengths[${i}]`, s.quote));
  if (a.features.pronunciation.level !== "not_assessed" && result.feature_sources.pronunciation !== "audio") {
    out.push("pronunciation assessed without the audio step");
  }
  for (const { field, text } of studentTexts(result)) {
    if (field.startsWith("features.pronunciation")) continue;
    const claim = findPronunciationClaim(text);
    if (claim) out.push(`pronunciation claim in ${field}: "${claim.slice(0, 120)}"`);
  }
  return out;
}

/**
 * Numbers the feedback states about the speech must match the stored metrics. Practice targets ("speak for at least
 * 90 seconds") and quoted words are not claims; only descriptive fields are checked. Returns items for human review.
 */
export function numericClaimMismatches(result: MultilevelResult, metrics: SpeechMetrics, audioSeconds: number): string[] {
  const out: string[] = [];
  const allowed: Record<string, number[]> = {
    words: [metrics.wordCount],
    seconds: [metrics.speakingSeconds, Math.round(metrics.speakingSeconds), Math.round(audioSeconds), 120, 60],
    wpm: [metrics.wordsPerMinute ?? -1],
    percent: [Math.round((metrics.timeUsedRatio ?? 0) * 100)],
    times: [...(metrics.repeatedWords ?? []).map((r) => r.count), ...metrics.repeatedPhrases.map((r) => r.count), metrics.fillerCount],
  };
  const near = (kind: string, n: number) => allowed[kind].some((a) => Math.abs(a - n) <= (kind === "times" ? 0 : 2));
  const descriptive = studentTexts(result).filter((t) => /^(questions|features\.\w+\.note|strengths|retry_review)/.test(t.field));
  for (const { field, text } of descriptive) {
    // Quoted words are the learner's own; sentences that set a practice target are not claims about the speech.
    const sentences = text.replace(/["“‘][^"”’]{0,200}["”’]/g, "").split(/(?<=[.!?])\s+/);
    for (const sentence of sentences.filter((x) => !/(at least|aim for|target|try to|should|next time|so that)/i.test(x))) {
      for (const m of sentence.matchAll(/(\d+(?:\.\d+)?)\s*(%|percent|words per minute|wpm|seconds?|secs?|words?|times)/gi)) {
        const n = Number(m[1]);
        const unit = m[2].toLowerCase();
        const kind = unit === "%" || unit === "percent" ? "percent" : /per minute|wpm/.test(unit) ? "wpm" : unit.startsWith("sec") ? "seconds" : unit.startsWith("word") ? "words" : "times";
        if (!near(kind, n)) {
          out.push(`numeric claim not matching metrics in ${field}: "${m[0]}" (metrics: words ${metrics.wordCount}, seconds ${metrics.speakingSeconds}, wpm ${metrics.wordsPerMinute}, used ${Math.round((metrics.timeUsedRatio ?? 0) * 100)}%)`);
        }
      }
    }
  }
  return out;
}

/** True when the run is pointed at something other than the real provider endpoints (e.g. a local stand-in). */
export function endpointOverrides(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...(env.OPENAI_BASE_URL && !/^https:\/\/api\.openai\.com\//.test(env.OPENAI_BASE_URL) ? ["OPENAI_BASE_URL"] : []),
    ...(env.GOOGLE_GEMINI_BASE_URL ? ["GOOGLE_GEMINI_BASE_URL"] : []),
  ];
}

/** Word error rate: word-level edit distance between what was spoken and what was transcribed, over the spoken length. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = evidenceTokens(reference);
  const hyp = evidenceTokens(hypothesis);
  const dp = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) dp[0][j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return ref.length ? dp[ref.length][hyp.length] / ref.length : 0;
}

/** Markdown lines describing one Multilevel result, for the human-review reports of the live runs. */
export function renderMultilevelResult(r: MultilevelResult): string[] {
  const s = r.scoring;
  const a = r.assessment;
  const lines = [
    `**Part ${r.part}: ${s.band}/${s.band_max} · ${s.label}** — ${s.meets_target ? "meets" : "below"} the B2 target${s.provisional ? " · provisional (pronunciation not assessed)" : ""}`,
    `Language level ${s.language_level} (mean ${s.language_mean}) · on topic ${s.on_topic_count}/${a.questions.length} · topic cap ${s.topic_cap} · language cap ${s.language_cap}${s.zero_reason ? ` · zero: ${s.zero_reason}` : ""}`,
    `Biggest fix: ${s.biggest_fix.kind === "feature" ? s.biggest_fix.feature : s.biggest_fix.kind === "question_coverage" ? `question ${s.biggest_fix.question_id}` : "own words"} · audio: ${r.audio.status}${r.audio.reason ? ` (${r.audio.reason})` : ""}`,
    "",
    "**Questions:** " + a.questions.map((q) => `Q${q.id} ${q.status}${q.evidence ? ` “${q.evidence}”` : ""} (${q.note})${q.model_answer ? ` → model: “${q.model_answer}”` : ""}`).join("; "),
    "",
    "**Features**",
    ...FEATURES.map((f) => {
      const x = a.features[f];
      return `- ${f}: **${x.level}** [${r.feature_sources[f]}] — ${x.note}${x.evidence.length ? ` — ${x.evidence.map((q) => `“${q}”`).join(", ")}` : ""}${x.how_to_improve ? `\n  - Fix: ${x.how_to_improve} (check: ${x.how_to_check})` : ""}`;
    }),
    "",
    "**Errors:** " + (a.errors.map((e) => `“${e.quote}” → “${e.correction}” (${e.type}${e.pattern ? `, ${e.pattern}` : ""})`).join("; ") || "—"),
    "",
    "**Error patterns:** " + (a.error_patterns.map((p) => `${p.name}: ${p.rule} Fix: ${p.how_to_fix}`).join(" | ") || "—"),
    "",
    "**Strengths:** " + (a.strengths.map((x) => `${x.feature}: “${x.quote}” — ${x.note}`).join("; ") || "—"),
    "",
    "**Retry focus**",
    ...r.retry_focus.map((f) => `- ${f.objective} (check: ${f.success_check})`),
  ];
  if (a.retry_review) lines.push("", "**Retry review**", ...a.retry_review.objectives.map((o) => `- ${o.outcome}: ${o.objective} — ${o.evidence}`), a.retry_review.summary);
  return lines;
}
