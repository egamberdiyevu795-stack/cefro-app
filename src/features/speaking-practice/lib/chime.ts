/**
 * The start-of-speaking signal: one short beep, then recording starts, like the exam's signal that the speaking time
 * has begun. Generated with Web Audio (no sound file). As in the Part 1 plan (docs/part1-plan.md), the beep is not
 * recorded: `playChime()` resolves when it has finished, and the recorder starts after that.
 *
 * Browsers only let a page play sound after the student has interacted with it, so `primeChime()` is called from the
 * "Start preparation" click; the beep a minute later (when preparation runs out) is then allowed. Sound failures are
 * ignored: the visible "Speak now" and "Recording" indicators carry the same information.
 */
let context: AudioContext | null = null;

export function primeChime(): void {
  try {
    if (typeof AudioContext === "undefined") return;
    context ??= new AudioContext();
    void context.resume();
  } catch {
    context = null;
  }
}

/** How long the beep lasts; recording starts after it. */
export const CHIME_MS = 400;

/** Plays the beep and resolves when it has finished (at once when sound is unavailable). */
export function playChime(): Promise<void> {
  try {
    if (!context) primeChime();
    if (!context) return Promise.resolve();
    const start = context.currentTime + 0.01;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = 1000;
    // Soft attack and release, so it is a clear beep, not a click.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.setValueAtTime(0.25, start + 0.3);
    gain.gain.linearRampToValueAtTime(0, start + 0.35);
    tone.connect(gain).connect(context.destination);
    tone.start(start);
    tone.stop(start + CHIME_MS / 1000);
    return new Promise((resolve) => setTimeout(resolve, CHIME_MS));
  } catch {
    // No sound; the screen still shows that recording started.
    return Promise.resolve();
  }
}
