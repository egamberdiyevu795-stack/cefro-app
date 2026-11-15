/**
 * Phones only play sound that a tap unlocked, and the mock's later parts start by themselves. So the "Start mock" tap
 * makes the mock's one audio element and plays a moment of silence on it, right there in the tap; every part then plays its
 * spoken introduction and questions on that same element. (A blob: URL, because the page's security policy allows no data: media.)
 */
function silentWav(): Blob {
  const samples = 800; // 0.1 s of 8 kHz silence
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return new Blob([bytes], { type: "audio/wav" });
}

/** Call inside a tap. Returns the audio element the whole mock plays its spoken audio on. */
export function createUnlockedAudio(): HTMLAudioElement {
  const audio = new Audio();
  try {
    const url = URL.createObjectURL(silentWav());
    audio.src = url;
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    void audio.play().catch(() => undefined);
  } catch {
    // Unlocking is best effort: a part whose sound is blocked still shows its text and carries on.
  }
  return audio;
}
