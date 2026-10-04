import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { AudioNotFoundError, type AudioStorage } from "./audio-storage";

/**
 * Stores audio on the local filesystem. Suitable for development and for a
 * single-server deployment with a persistent disk. Not suitable for
 * serverless hosting (ephemeral filesystem) — use an object-storage provider there.
 */
export class LocalAudioStorage implements AudioStorage {
  readonly provider = "local";

  constructor(private readonly rootDir: string) {}

  async save(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Write to a temp file then rename, so a crash never leaves a half-written recording.
    const tempPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AudioNotFoundError(key);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path.join(path.resolve(this.rootDir), key);
  }
}
