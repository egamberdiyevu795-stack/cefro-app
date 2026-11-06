/**
 * The start-of-speaking signal: the exam-style chime, then recording starts. Part 2 plays the same sound file as
 * Part 1 (`PART1_CHIME` in `content/speaking/part1/chime.ts` on the Part 1 branch: a placeholder tone made by
 * `scripts/make-part1-placeholder-audio.mjs`, an original work), so both parts sound the same. As in the Part 1 plan
 * (docs/part1-plan.md), the chime is not recorded: `playChime()` resolves when it has finished playing, and the
 * recorder starts after that.
 *
 * Browsers only let a page play sound after the student has interacted with it, so `primeChime()` is called from the
 * "Start preparation" click: it unlocks audio and loads the file, and the chime a minute later (when preparation runs
 * out) is then allowed. Sound failures (no Web Audio, file missing, decode error) are ignored: `playChime()` resolves
 * at once and the visible "Speak now" and "Recording" indicators carry the same information.
 */
export const CHIME_SRC = "/audio/speaking/part1/placeholder/chime.wav";

/** Longest wait for the file when the student skips preparation before it has loaded. */
const LOAD_TIMEOUT_MS = 3_000;
/** Settles a chime whose "ended" never comes (a suspended audio output), a little after its own length. */
const END_GRACE_MS = 500;

let context: AudioContext | null = null;
let chime: Promise<AudioBuffer | null> | null = null;

export function primeChime(): void {
  try {
    if (typeof AudioContext === "undefined") return;
    context ??= new AudioContext();
    void context.resume();
    chime ??= loadChime(context);
  } catch {
    context = null;
  }
}

async function loadChime(ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(CHIME_SRC);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Plays the chime and resolves when it has finished (at once when sound is unavailable). */
export async function playChime(): Promise<void> {
  try {
    if (!context) primeChime();
    const ctx = context;
    if (!ctx || !chime) return;
    const buffer = await withTimeout(chime, LOAD_TIMEOUT_MS, null);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(watchdog);
        resolve();
      };
      const watchdog = setTimeout(done, buffer.duration * 1000 + END_GRACE_MS);
      source.addEventListener("ended", done, { once: true });
      source.start();
    });
  } catch {
    // No sound; the screen still shows that recording started.
  }
}
