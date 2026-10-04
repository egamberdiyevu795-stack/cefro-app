import "server-only";
import { getEnv } from "@/server/config/env";
import { isTursoConfigured } from "@/server/db/target";
import type { AudioStorage } from "./audio-storage";
import { DatabaseAudioStorage } from "./database-audio-storage";
import { LocalAudioStorage } from "./local-audio-storage";

let instance: AudioStorage | undefined;

/**
 * "auto": recordings go in the database when a hosted database is configured (serverless: no shared disk), otherwise
 * to files under AUDIO_STORAGE_DIR (development, a self-hosted server with a disk).
 */
export function getAudioStorage(): AudioStorage {
  if (!instance) {
    const env = getEnv();
    const provider = env.AUDIO_STORAGE_PROVIDER === "auto" ? (isTursoConfigured(env) ? "database" : "local") : env.AUDIO_STORAGE_PROVIDER;
    instance = provider === "database" ? new DatabaseAudioStorage() : new LocalAudioStorage(env.AUDIO_STORAGE_DIR);
  }
  return instance;
}

export function setAudioStorageForTesting(storage: AudioStorage | undefined) {
  instance = storage;
}

export type { AudioStorage } from "./audio-storage";
export { AudioNotFoundError } from "./audio-storage";
