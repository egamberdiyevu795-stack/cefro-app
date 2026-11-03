import "server-only";

export interface TranscriptionInput {
  audio: Buffer;
  mimeType: string;
  /** BCP-47 / ISO-639-1 hint; speaking practice is English-only for now. */
  language: "en";
}

export interface TranscriptionOutput {
  text: string;
  language: string | null;
  /**
   * Usage metadata exactly as the provider reported it (token or duration counts), when it reports any.
   * Not persisted: used for cost/latency validation only. Never contains transcript text or credentials.
   */
  usage?: Record<string, number | string>;
  /** Set when a fallback provider produced the text (see FallbackTranscriptionProvider); otherwise the provider's own name/model apply. */
  provider?: string;
  model?: string;
}

/**
 * Speech-to-text provider. Implementations must throw `ProviderError`
 * (with a FailureCode) for every failure, never return partial results.
 */
export interface TranscriptionProvider {
  readonly name: string;
  readonly model: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}
