/**
 * The start-of-speaking signal: a short, soft two-tone chime made in code with the Web Audio API (no sound file), then
 * recording starts. As in the Part 1 plan (docs/part1-plan.md), the chime is not recorded: `playChime()` resolves when
 * it has finished playing, and the recorder starts after that.
 *
 * It never plays before the student presses a button. Browsers only allow sound after an interaction anyway, and the
 * audio context is created only by `primeChime()`, which is called from the "Start preparation" click; `playChime()`
 * without that does nothing. Sound failures (no Web Audio, a suspended output) are ignored: `playChime()` resolves and
 * the visible "Speak now" and "Recording" indicators carry the same information.
 */

/** The two tones, low then high (E5 then A5, a rising fourth): sine waves, so the sound is soft. */
export const CHIME_TONES = [
  { frequency: 659.25, start: 0 },
  { frequency: 880, start: 0.16 },
] as const;
/** How long each tone rings (a quick fade-in, then a smooth fade-out). */
export const CHIME_TONE_SECONDS = 0.34;
/** The whole chime: the last tone's start plus its length (0.5 s). */
export const CHIME_SECONDS = CHIME_TONES[CHIME_TONES.length - 1].start + CHIME_TONE_SECONDS;
/** Peak loudness of each tone (0–1): quiet, a chime and not a beep. */
const PEAK_GAIN = 0.18;
/** Fade-in, so a tone never starts with a click. */
const ATTACK_SECONDS = 0.015;
/** Settles a chime whose "ended" never comes (a suspended audio output), a little after its own length. */
const END_GRACE_MS = 500;

/** Longest wait for a suspended audio output to resume before the chime is skipped. */
const RESUME_WAIT_MS = 300;

let context: AudioContext | null = null;

/** Resolves when `promise` settles or after `ms`, whichever comes first; never rejects. */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => (clearTimeout(timer), resolve()),
      () => (clearTimeout(timer), resolve()),
    );
  });
}

/** Called from the "Start preparation" click: creates and unlocks the audio context, so the chime may play later. */
export function primeChime(): void {
  try {
    if (typeof AudioContext === "undefined") return;
    context ??= new AudioContext();
    void context.resume();
  } catch {
    context = null;
  }
}

/** One tone: a sine wave with a short fade-in and an exponential fade-out, scheduled at `at` (context time). */
function tone(ctx: AudioContext, frequency: number, at: number): OscillatorNode {
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + CHIME_TONE_SECONDS);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + CHIME_TONE_SECONDS);
  return oscillator;
}

/** Plays the chime and resolves when it has finished (at once when sound is unavailable or was never primed). */
export async function playChime(): Promise<void> {
  try {
    const ctx = context;
    if (!ctx) return; // never primed by a button press: no sound
    // A suspended output (e.g. a phone that paused audio) may never resume: wait a moment at most, never block recording.
    if (ctx.state !== "running") await settleWithin(ctx.resume(), RESUME_WAIT_MS);
    const now = ctx.currentTime + 0.01;
    const oscillators = CHIME_TONES.map((t) => tone(ctx, t.frequency, now + t.start));
    const last = oscillators[oscillators.length - 1];
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(watchdog);
        resolve();
      };
      const watchdog = setTimeout(done, CHIME_SECONDS * 1000 + END_GRACE_MS);
      last.addEventListener("ended", done, { once: true });
    });
  } catch {
    // No sound; the screen still shows that recording started.
  }
}
