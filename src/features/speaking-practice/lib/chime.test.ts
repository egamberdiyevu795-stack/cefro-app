import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A minimal Web Audio stand-in: records contexts and the tones started on them. */
function fakeAudio() {
  const log: string[] = [];
  const peaks: number[] = [];
  class FakeParam {
    value = 0;
    setValueAtTime() {}
    linearRampToValueAtTime(v: number) {
      peaks.push(v);
    }
    exponentialRampToValueAtTime() {}
  }
  class FakeNode {
    connect(next: unknown) {
      return next;
    }
    disconnect() {}
  }
  class FakeBufferSource extends FakeNode {
    buffer: { getChannelData: () => Float32Array; length: number } | null = null;
    loop = false;
    start() {
      log.push(`hum ${this.loop ? "looping" : "once"} (${this.buffer?.length} samples)`);
    }
    stop() {
      log.push("hum stopped");
    }
  }
  class FakeOscillator extends FakeNode {
    type = "";
    frequency = new FakeParam();
    private listeners: Array<() => void> = [];
    addEventListener(_: string, fn: () => void) {
      this.listeners.push(fn);
    }
    start(at: number) {
      log.push(`tone ${Math.round(this.frequency.value)} Hz at ${at.toFixed(2)}`);
    }
    stop() {
      setTimeout(() => this.listeners.forEach((fn) => fn()), 0);
    }
  }
  class FakeContext {
    state = "running";
    currentTime = 1;
    sampleRate = 48_000;
    destination = new FakeNode();
    constructor() {
      log.push("context");
    }
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      return Object.assign(new FakeNode(), { gain: new FakeParam() });
    }
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    }
    createBufferSource() {
      return new FakeBufferSource();
    }
  }
  return { log, peaks, FakeContext };
}

describe("start-of-speaking chime (Web Audio, no file)", () => {
  let audio: ReturnType<typeof fakeAudio>;

  beforeEach(() => {
    vi.resetModules();
    audio = fakeAudio();
    vi.stubGlobal("AudioContext", audio.FakeContext);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no file may be fetched"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never plays before a button press: without primeChime there is no context and no tone", async () => {
    const { playChime } = await import("./chime");
    await playChime();
    expect(audio.log).toEqual([]);
  });

  it("after the click: two soft tones, low then high, and it resolves when they end; no file fetched", async () => {
    const { CHIME_SECONDS, CHIME_TONES, playChime, primeChime } = await import("./chime");
    primeChime();
    expect(audio.log).toEqual(["context", "hum looping (960 samples)"]);
    await playChime();
    expect(audio.log).toEqual(["context", "hum looping (960 samples)", "tone 659 Hz at 1.01", "tone 880 Hz at 1.17"]);
    expect(CHIME_TONES[0].frequency).toBeLessThan(CHIME_TONES[1].frequency);
    expect(CHIME_SECONDS).toBeLessThanOrEqual(0.6);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a suspended output that never resumes does not block recording", async () => {
    vi.useFakeTimers();
    try {
      class StuckContext extends audio.FakeContext {
        state = "suspended";
        resume() {
          return new Promise<void>(() => undefined); // never settles
        }
      }
      vi.stubGlobal("AudioContext", StuckContext);
      const { playChime, primeChime } = await import("./chime");
      primeChime();
      let done = false;
      void playChime().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(2_000);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no Web Audio: nothing happens and it still resolves", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { playChime, primeChime } = await import("./chime");
    primeChime();
    await expect(playChime()).resolves.toBeUndefined();
  });

  it("loud enough to hear next to the examiner's voice, without clipping when the two tones overlap", async () => {
    const { CHIME_PEAK_GAIN, playChime, primeChime } = await import("./chime");
    primeChime();
    await playChime();
    expect(audio.peaks).toEqual([CHIME_PEAK_GAIN, CHIME_PEAK_GAIN]);
    expect(CHIME_PEAK_GAIN).toBeGreaterThanOrEqual(0.4);
    expect(CHIME_PEAK_GAIN * 2).toBeLessThanOrEqual(1);
  });

  it("keeps the sound output awake from the click until released, so the chime after a silent minute is not swallowed", async () => {
    const { KEEP_AWAKE_GAIN, KEEP_AWAKE_HZ, playChime, primeChime, releaseChime } = await import("./chime");
    primeChime();
    primeChime(); // a second click never starts a second hum
    expect(audio.log.filter((e) => e.startsWith("hum"))).toEqual(["hum looping (960 samples)"]); // 48 kHz / 50 Hz
    expect(KEEP_AWAKE_HZ).toBeLessThanOrEqual(60); // below what laptop speakers play, and barely audible on headphones
    expect(KEEP_AWAKE_GAIN).toBeLessThanOrEqual(0.005); // about −50 dBFS
    // Preparation ran out: the chime still plays (two tones) with the hum running.
    await playChime();
    expect(audio.log.filter((e) => e.startsWith("tone"))).toHaveLength(2);
    releaseChime();
    expect(audio.log.at(-1)).toBe("hum stopped");
    // The chime still works after release (re-recording), and the next part's click starts the hum again.
    await playChime();
    expect(audio.log.filter((e) => e.startsWith("tone"))).toHaveLength(4);
    primeChime();
    expect(audio.log.filter((e) => e === "hum looping (960 samples)")).toHaveLength(2);
  });

  it("a browser without buffer sources still plays the chime", async () => {
    class NoBuffers extends audio.FakeContext {
      createBufferSource(): never {
        throw new Error("not supported");
      }
    }
    vi.stubGlobal("AudioContext", NoBuffers);
    const { playChime, primeChime } = await import("./chime");
    primeChime();
    await playChime();
    expect(audio.log.filter((e) => e.startsWith("tone"))).toHaveLength(2);
  });
});
