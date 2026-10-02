import "server-only";

/**
 * Identify an audio container from its first bytes ("magic numbers"), so a
 * client cannot upload arbitrary data by merely claiming an audio MIME type.
 */
export type AudioContainer = "webm" | "ogg" | "mp4" | "wav" | "mpeg";

const CONTAINER_BY_MIME: Record<string, AudioContainer> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "mp4",
  "audio/wav": "wav",
  "audio/mpeg": "mpeg",
};

export function containerForMime(baseMime: string): AudioContainer | undefined {
  return CONTAINER_BY_MIME[baseMime];
}

export function sniffAudioContainer(data: Buffer): AudioContainer | null {
  if (data.length < 12) return null;
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return "webm"; // EBML
  if (data.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (data.toString("ascii", 4, 8) === "ftyp") return "mp4";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (data.toString("ascii", 0, 3) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return "mpeg";
  return null;
}
