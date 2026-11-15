import { describe, expect, it } from "vitest";
import { CuePlayer, type CueElement, type CueTimers } from "./cue-player";

type Listener = () => void;

class FakeAudio implements CueElement {
  src = "";
  duration = 1;
  paused = 0;
  listeners: Record<string, Listener[]> = {};
  playImpl: () => Promise<void> = () => Promise.resolve();
  play() {
    return this.playImpl();
  }
  pause() {
    this.paused++;
  }
  addEventListener(type: string, l: Listener) {
    (this.listeners[type] ??= []).push(l);
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x !== l);
  }
  fire(type: string) {
    for (const l of [...(this.listeners[type] ?? [])]) l();
  }
  listenerCount() {
    return Object.values(this.listeners).reduce((n, list) => n + list.length, 0);
  }
}

class FakeTimers implements CueTimers {
  private next = 1;
  pending = new Map<number, { fn: () => void; at: number }>();
  now = 0;
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.pending.set(id, { fn, at: this.now + ms });
    return id;
  }
  clearTimeout(id: unknown) {
    this.pending.delete(id as number);
  }
  advance(ms: number) {
    this.now += ms;
    for (const [id, t] of [...this.pending]) {
      if (t.at <= this.now) {
        this.pending.delete(id);
        t.fn();
      }
    }
  }
}

const TIMEOUTS = { startMs: 8000, maxMs: 30_000 };

function setup() {
  const audio = new FakeAudio();
  const timers = new FakeTimers();
  return { audio, timers, player: new CuePlayer(audio, TIMEOUTS, timers) };
}

describe("CuePlayer", () => {
  it("resolves ok when the sound ends, and cleans up", async () => {
    const { audio, timers, player } = setup();
    const result = player.play("/q1.wav");
    expect(audio.src).toBe("/q1.wav");
    audio.fire("playing");
    audio.fire("ended");
    expect(await result).toEqual({ ok: true });
    expect(audio.listenerCount()).toBe(0);
    expect(timers.pending.size).toBe(0);
  });

  it("a load error fails the cue", async () => {
    const { audio, player } = setup();
    const result = player.play("/missing.wav");
    audio.fire("error");
    expect(await result).toEqual({ ok: false, reason: "load_error" });
  });

  it("a rejected play() fails the cue (autoplay blocked)", async () => {
    const { audio, player } = setup();
    audio.playImpl = () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    expect(await player.play("/q1.wav")).toEqual({ ok: false, reason: "autoplay_blocked" });
  });

  it("no playback within the start timeout fails the cue", async () => {
    const { timers, player } = setup();
    const result = player.play("/q1.wav");
    timers.advance(8000);
    expect(await result).toEqual({ ok: false, reason: "timeout_start" });
  });

  it("playback that never ends fails after the max timeout", async () => {
    const { audio, timers, player } = setup();
    const result = player.play("/q1.wav");
    audio.fire("playing");
    timers.advance(10_000); // past the start timeout: cleared by "playing"
    timers.advance(20_000);
    expect(await result).toEqual({ ok: false, reason: "timeout_end" });
    expect(audio.paused).toBeGreaterThan(0);
  });

  it("settles only once (error, then a late ended)", async () => {
    const { audio, player } = setup();
    const result = player.play("/q1.wav");
    audio.fire("error");
    audio.fire("ended");
    expect(await result).toEqual({ ok: false, reason: "load_error" });
  });

  it("a new cue supersedes the previous one; stop() settles the current one", async () => {
    const { audio, player } = setup();
    const first = player.play("/q1.wav");
    const second = player.play("/chime.wav");
    expect(await first).toEqual({ ok: false, reason: "superseded" });
    player.stop();
    expect(await second).toEqual({ ok: false, reason: "superseded" });
    expect(audio.listenerCount()).toBe(0);
  });
});
