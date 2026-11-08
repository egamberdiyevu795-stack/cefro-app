import type { BrowserContext, Page } from "@playwright/test";

/**
 * The spoken introductions of Part 2 and Part 3 are real-time audio (15–21 s). Tests that are not about them serve a
 * 0.2 s silent WAV in their place, so the one-minute preparation starts after a moment. The real files are checked by
 * the unit tests and by the "real introduction" test in e2e/part3.spec.ts.
 */
export function silentWav(seconds = 0.2, rate = 22_050): Buffer {
  const samples = Math.round(seconds * rate);
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + data, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(data, 40);
  return wav;
}

export async function shortPartIntros(page: Page | BrowserContext): Promise<void> {
  await page.route(/\/audio\/speaking\/part[23]\/intro\/v\d+\/intro\.wav$/, (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() }),
  );
}
