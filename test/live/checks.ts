import { evidenceTokens, isQuoteInTranscript } from "@/domain/evaluation/evidence";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { findPronunciationClaim } from "@/server/evaluation/quality-gate";

/** Checks applied to every real evaluation in the live pipeline validation. Pure, so they are unit-tested (test/pipeline-checks.test.ts). */

export function studentTexts(result: EvaluationResult): { field: string; text: string }[] {
  return [
    { field: "overall_summary", text: result.overall_summary },
    ...(result.reliability_note ? [{ field: "reliability_note", text: result.reliability_note }] : []),
    ...Object.entries(result.criteria).map(([k, c]) => ({ field: `criteria.${k}`, text: c.justification })),
    ...result.strengths.flatMap((s, i) => [{ field: `strengths[${i}]`, text: `${s.title}. ${s.detail}` }]),
    ...result.issues.flatMap((issue, i) => [
      { field: `issues[${i}].problem`, text: issue.problem },
      { field: `issues[${i}].why_it_matters`, text: issue.why_it_matters },
      { field: `issues[${i}].how_to_fix`, text: issue.how_to_fix },
    ]),
    ...result.retry_focus.flatMap((f, i) => [{ field: `retry_focus[${i}]`, text: `${f.objective} ${f.success_check}` }]),
    ...(result.retry_review
      ? [
          { field: "retry_review.summary", text: result.retry_review.summary },
          ...result.retry_review.objectives.map((o, i) => ({ field: `retry_review[${i}]`, text: `${o.objective} ${o.evidence}` })),
        ]
      : []),
  ];
}

/** Evidence that must be true by construction: quotes occur in the transcript; pronunciation is never assessed. */
export function evidenceViolations(result: EvaluationResult, transcript: string): string[] {
  const out: string[] = [];
  for (const [i, s] of result.strengths.entries()) {
    if (s.evidence_quote && !isQuoteInTranscript(s.evidence_quote, transcript)) out.push(`strengths[${i}] quote not in transcript: "${s.evidence_quote}"`);
  }
  for (const [i, issue] of result.issues.entries()) {
    for (const quote of issue.evidence_quotes) {
      if (!isQuoteInTranscript(quote, transcript)) out.push(`issues[${i}] quote not in transcript: "${quote}"`);
    }
    if (issue.improved_example.original && !isQuoteInTranscript(issue.improved_example.original, transcript)) {
      out.push(`issues[${i}] improved_example.original not in transcript`);
    }
  }
  if (result.criteria.pronunciation.assessable) out.push("pronunciation marked assessable from a transcript");
  for (const { field, text } of studentTexts(result)) {
    const claim = findPronunciationClaim(text);
    if (claim) out.push(`pronunciation claim in ${field}: "${claim.slice(0, 120)}"`);
  }
  return out;
}

/**
 * Numbers the feedback states about the speech must match the stored metrics. Practice targets ("speak for at least
 * 90 seconds") and quoted words are not claims; only descriptive fields are checked. Returns items for human review.
 */
export function numericClaimMismatches(result: EvaluationResult, metrics: SpeechMetrics, audioSeconds: number): string[] {
  const out: string[] = [];
  const allowed: Record<string, number[]> = {
    words: [metrics.wordCount],
    seconds: [metrics.speakingSeconds, Math.round(metrics.speakingSeconds), Math.round(audioSeconds), 120, 60],
    wpm: [metrics.wordsPerMinute ?? -1],
    percent: [Math.round((metrics.timeUsedRatio ?? 0) * 100)],
    times: [...(metrics.repeatedWords ?? []).map((r) => r.count), ...metrics.repeatedPhrases.map((r) => r.count), metrics.fillerCount],
  };
  const near = (kind: string, n: number) => allowed[kind].some((a) => Math.abs(a - n) <= (kind === "times" ? 0 : 2));
  const descriptive = studentTexts(result).filter((t) => /^(overall_summary|reliability_note|criteria\.|strengths|issues\[\d+\]\.(problem|why_it_matters)|retry_review)/.test(t.field));
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
