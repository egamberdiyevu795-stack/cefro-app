import "server-only";

/**
 * Where recorded audio bytes live. The database only stores
 * `{ provider, key }`, so providers can be swapped (local disk → S3/R2/GCS)
 * by adding an implementation and changing AUDIO_STORAGE_PROVIDER.
 */
export interface AudioStorage {
  /** Identifier persisted with each recording, e.g. "local". */
  readonly provider: string;
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
}

export class AudioNotFoundError extends Error {
  constructor(key: string) {
    super(`Audio not found: ${key}`);
    this.name = "AudioNotFoundError";
  }
}
