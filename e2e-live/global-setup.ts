import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { synthesizeSpeechWav } from "../test/live/audio";
import { PART2_BAND_ANCHORS } from "../test/evaluation-samples/part2-band-anchors";

/** Builds the fake-microphone file: the B2 anchor answer read aloud, preceded by silence so no word is lost before recording starts. */
export const BROWSER_ANSWER_TEXT = PART2_BAND_ANCHORS.find((s) => s.id.startsWith("A4"))!.transcript;
export const LEAD_IN_SECONDS = 3;

export default async function globalSetup() {
  const speech = await synthesizeSpeechWav(BROWSER_ANSWER_TEXT);
  const target = path.join(process.cwd(), "eval-audio", "browser-answer.wav");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const ms = LEAD_IN_SECONDS * 1000;
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", speech, "-af", `adelay=${ms}|${ms}`, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", target]);
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${String(result.stderr).slice(-300)}`);
}
