import { describe, expect, it } from "vitest";
import { RecordingClock } from "./recording-clock";

describe("RecordingClock", () => {
  it("counts only running time", () => {
    let t = 0;
    const clock = new RecordingClock(() => t);
    expect(clock.elapsedMs()).toBe(0);
    clock.resume();
    t = 30_000;
    expect(clock.elapsedMs()).toBe(30_000);
    clock.pause();
    t = 34_000; // question audio + chime
    expect(clock.elapsedMs()).toBe(30_000);
    clock.resume();
    t = 64_000;
    expect(clock.elapsedMs()).toBe(60_000);
  });

  it("repeated pause/resume calls have no extra effect", () => {
    let t = 0;
    const clock = new RecordingClock(() => t);
    clock.resume();
    t = 10;
    clock.resume();
    t = 20;
    clock.pause();
    clock.pause();
    t = 100;
    expect(clock.elapsedMs()).toBe(20);
    expect(clock.running).toBe(false);
  });
});
