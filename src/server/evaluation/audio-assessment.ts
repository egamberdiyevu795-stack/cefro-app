import "server-only";
import { isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { audioAssessmentSchema, type AudioAssessment } from "@/domain/evaluation/multilevel/model-output";
import type { MultilevelRubricConfig } from "@/domain/evaluation/multilevel/rubric-config";
import { logger } from "@/server/logging/logger";
import { buildAudioAssessmentPrompt } from "./prompts/multilevel-audio-assessment";
import { findPronunciationClaim, INTERNAL_FIELD_NAMES } from "./quality-gate";
import type { AudioAssessor } from "./types";

export type AudioOutcome =
  | { status: "assessed"; assessment: AudioAssessment; provider: string; model: string; inputTokens: number | null; outputTokens: number | null }
  | { status: "not_assessed"; reason: "disabled" | "no_audio" | "failed" | "unclear"; provider: string | null; model: string | null };

/**
 * The audio step: pronunciation and pausing judged from the recording. It never fails the attempt: when it is
 * switched off, there is no audio, the call fails or its output is unusable, pronunciation is "not_assessed" and the
 * result is marked provisional.
 */
export async function runAudioAssessment(options: {
  assessor: AudioAssessor | null;
  audio: Buffer | null;
  mimeType: string;
  transcript: string;
  config: MultilevelRubricConfig;
}): Promise<AudioOutcome> {
  const { assessor, audio } = options;
  if (!assessor) return { status: "not_assessed", reason: "disabled", provider: null, model: null };
  if (!audio || audio.byteLength === 0) return { status: "not_assessed", reason: "no_audio", provider: assessor.provider, model: assessor.model };

  try {
    const raw = await assessor.assess({
      prompt: buildAudioAssessmentPrompt(options.config, options.transcript),
      audio,
      mimeType: options.mimeType,
    });
    const value = typeof raw.output === "string" ? JSON.parse(stripCodeFence(raw.output)) : raw.output;
    const parsed = audioAssessmentSchema.safeParse(value);
    if (!parsed.success) throw new Error(`Audio assessment failed schema validation: ${parsed.error.issues[0]?.message}`);
    const assessment = parsed.data;
    if (!assessment.speech_audible) {
      return { status: "not_assessed", reason: "unclear", provider: raw.provider, model: raw.model };
    }
    // Student-facing text from this step must not leak field names; "accent" talk is excluded by the prompt, and an
    // explicit accent criticism makes the judgement unusable.
    const texts = [assessment.pronunciation.note, assessment.pronunciation.how_to_improve, assessment.fluency.note];
    if (texts.some((t) => INTERNAL_FIELD_NAMES.test(t) || /\baccent\b/i.test(t))) throw new Error("Audio assessment text is unusable (field name or accent comment)");
    if (findPronunciationClaim(assessment.fluency.note)) throw new Error("Fluency note talks about pronunciation");
    assessment.pronunciation.evidence = assessment.pronunciation.evidence.filter((q) =>
      isQuoteInTranscript(q, options.transcript, { strict: true }),
    );
    return { status: "assessed", assessment, provider: raw.provider, model: raw.model, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens };
  } catch (error) {
    logger.warn("Audio assessment failed; pronunciation not assessed", { reason: error instanceof Error ? error.message : String(error) });
    return { status: "not_assessed", reason: "failed", provider: assessor.provider, model: assessor.model };
  }
}

function stripCodeFence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}
