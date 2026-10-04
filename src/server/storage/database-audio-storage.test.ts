import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/server/db/client";
import { AudioNotFoundError } from "./audio-storage";
import { DatabaseAudioStorage } from "./database-audio-storage";

let db: Db;
let storage: DatabaseAudioStorage;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  storage = new DatabaseAudioStorage(db);
});
afterEach(() => db.$client.close());

describe("DatabaseAudioStorage", () => {
  it("returns exactly the bytes that were saved, including every byte value", async () => {
    const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    await storage.save("audio/a.webm", data, "audio/webm");
    const read = await storage.read("audio/a.webm");
    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read.equals(data)).toBe(true);
  });

  it("round-trips a recording-sized (2 MB) blob without altering it", async () => {
    const data = crypto.randomBytes(2 * 1024 * 1024);
    await storage.save("audio/big.webm", data, "audio/webm");
    const read = await storage.read("audio/big.webm");
    expect(read.byteLength).toBe(data.byteLength);
    expect(crypto.createHash("sha256").update(read).digest("hex")).toBe(crypto.createHash("sha256").update(data).digest("hex"));
  });

  it("is readable through another storage object on the same database (another request or instance)", async () => {
    await storage.save("audio/shared.webm", Buffer.from("hello"), "audio/webm");
    expect((await new DatabaseAudioStorage(db).read("audio/shared.webm")).toString()).toBe("hello");
  });

  it("replaces the content when the same key is saved again", async () => {
    await storage.save("audio/k.webm", Buffer.from("one"), "audio/webm");
    await storage.save("audio/k.webm", Buffer.from("three"), "audio/ogg");
    expect((await storage.read("audio/k.webm")).toString()).toBe("three");
  });

  it("reports a missing recording as AudioNotFoundError, and deletes idempotently", async () => {
    await expect(storage.read("audio/missing.webm")).rejects.toBeInstanceOf(AudioNotFoundError);
    await storage.save("audio/d.webm", Buffer.from("x"), "audio/webm");
    await storage.delete("audio/d.webm");
    await storage.delete("audio/d.webm");
    await expect(storage.read("audio/d.webm")).rejects.toBeInstanceOf(AudioNotFoundError);
  });

  it("refuses keys that are not server-generated paths", async () => {
    for (const key of ["../x", "a/../b", "a b", "", "x;drop"]) {
      await expect(storage.save(key, Buffer.from("x"), "audio/webm")).rejects.toThrow(/Invalid storage key/);
      await expect(storage.read(key)).rejects.toThrow(/Invalid storage key/);
    }
  });
});
