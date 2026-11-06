/**
 * The start-of-speaking signal: one short beep when recording starts, like the exam's signal that the speaking time
 * has begun. Generated with Web Audio (no sound file).
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

export function playChime(): void {
  try {
    if (!context) primeChime();
    if (!context) return;
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
    tone.stop(start + 0.4);
  } catch {
    // No sound; the screen still shows that recording started.
  }
}
