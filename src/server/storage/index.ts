import "server-only";
import { getEnv } from "@/server/config/env";
import type { AudioStorage } from "./audio-storage";
import { LocalAudioStorage } from "./local-audio-storage";

let instance: AudioStorage | undefined;

export function getAudioStorage(): AudioStorage {
  if (!instance) {
    const env = getEnv();
    switch (env.AUDIO_STORAGE_PROVIDER) {
      case "local":
        instance = new LocalAudioStorage(env.AUDIO_STORAGE_DIR);
        break;
    }
  }
  return instance;
}

export function setAudioStorageForTesting(storage: AudioStorage | undefined) {
  instance = storage;
}

export type { AudioStorage } from "./audio-storage";
export { AudioNotFoundError } from "./audio-storage";
