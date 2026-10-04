import "server-only";

/**
 * Where recorded audio bytes live. The database only stores
 * `{ provider, key }`, so providers can be swapped (local disk → S3/R2/GCS)
 * by adding an implementation and changing AUDIO_STORAGE_PROVIDER. Implementations: `local` (files, single server),
 * `database` (a table in the application database, shared by every serverless instance).
 */
export interface AudioStorage {
  /** Identifier persisted with each recording, e.g. "local". */
  readonly provider: string;
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Remove a recording (used to clean up when the attempt row could not be created). Optional: missing keys are not an error. */
  delete?(key: string): Promise<void>;
}

export class AudioNotFoundError extends Error {
  constructor(key: string) {
    super(`Audio not found: ${key}`);
    this.name = "AudioNotFoundError";
  }
}
