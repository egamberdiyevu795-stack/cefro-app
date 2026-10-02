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
