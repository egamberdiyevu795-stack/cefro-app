import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A minimal Web Audio stand-in: records contexts and the tones started on them. */
function fakeAudio() {
  const log: string[] = [];
  class FakeParam {
    value = 0;
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeNode {
    connect(next: unknown) {
      return next;
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
  }
  return { log, FakeContext };
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
    expect(audio.log).toEqual(["context"]);
    await playChime();
    expect(audio.log).toEqual(["context", "tone 659 Hz at 1.01", "tone 880 Hz at 1.17"]);
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
});
