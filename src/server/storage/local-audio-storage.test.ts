import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AudioNotFoundError } from "./audio-storage";
import { LocalAudioStorage } from "./local-audio-storage";

/** The audio endpoint can only read what a stored key points at, and a key can never leave the storage directory. */
let root: string;
let outside: string;
let storage: LocalAudioStorage;

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-storage-"));
  root = path.join(base, "audio");
  outside = path.join(base, "secret.txt");
  fs.mkdirSync(root);
  fs.writeFileSync(outside, "TOP SECRET");
  storage = new LocalAudioStorage(root);
});
afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("LocalAudioStorage", () => {
  it("saves and reads back exactly the bytes it was given, in nested directories it creates", async () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    await storage.save("speaking/11111111-1111-4111-8111-111111111111/a.webm", bytes);
    expect((await storage.read("speaking/11111111-1111-4111-8111-111111111111/a.webm")).equals(bytes)).toBe(true);
  });

  it("leaves no temporary file behind (writes are atomic)", async () => {
    await storage.save("speaking/u/a.webm", Buffer.from("x"));
    const files = fs.readdirSync(path.join(root, "speaking/u"));
    expect(files).toEqual(["a.webm"]);
  });

  it("reports a missing recording as AudioNotFoundError", async () => {
    await expect(storage.read("speaking/u/missing.webm")).rejects.toBeInstanceOf(AudioNotFoundError);
  });

  it.each([
    ["parent traversal", "../secret.txt"],
    ["nested traversal", "speaking/../../secret.txt"],
    ["traversal hidden between dots", "speaking/....//secret.txt"],
    ["backslash traversal", "..\\secret.txt"],
    ["encoded traversal", "..%2Fsecret.txt"],
    ["a space", "speaking/a b.webm"],
    ["a null byte", "speaking/a\u0000.webm"],
    ["a non-ASCII name", "speaking/é.webm"],
    ["an empty key", ""],
  ])("rejects %s for both save and read, and nothing outside the directory is touched", async (_label, key) => {
    await expect(storage.read(key)).rejects.toThrow(/Invalid storage key/);
    await expect(storage.save(key, Buffer.from("pwned"))).rejects.toThrow(/Invalid storage key/);
    expect(fs.readFileSync(outside, "utf8")).toBe("TOP SECRET");
  });

  it("treats an absolute-looking key as relative to the storage directory, never as a filesystem path", async () => {
    await storage.save("/etc/cefro-test.webm", Buffer.from("inside"));
    expect(fs.existsSync(path.join(root, "etc/cefro-test.webm"))).toBe(true);
    expect(fs.existsSync("/etc/cefro-test.webm")).toBe(false);
    await expect(storage.read("/etc/passwd")).rejects.toBeInstanceOf(AudioNotFoundError); // not the real /etc/passwd
  });
});
