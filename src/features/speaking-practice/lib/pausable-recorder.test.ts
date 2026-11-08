import { describe, expect, it } from "vitest";
import { PausableRecorder, type RecorderLike } from "./pausable-recorder";

class FakeRecorder implements RecorderLike {
  state: RecorderLike["state"] = "inactive";
  mimeType = "audio/webm";
  calls: string[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start() {
    this.calls.push("start");
    this.state = "recording";
  }
  pause() {
    this.calls.push("pause");
    this.state = "paused";
  }
  resume() {
    this.calls.push("resume");
    this.state = "recording";
  }
  stop() {
    this.calls.push("stop");
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}

function setup() {
  let t = 0;
  const fake = new FakeRecorder();
  const created: FakeRecorder[] = [];
  const recorder = new PausableRecorder({} as MediaStream, {
    now: () => t,
    factory: () => {
      created.push(fake);
      return fake;
    },
  });
  return { recorder, fake, created, advance: (ms: number) => (t += ms) };
}

describe("PausableRecorder: one file, paused between questions", () => {
  it("starts once, then pauses and resumes; offsets are in recording time", async () => {
    const { recorder, fake, created, advance } = setup();
    expect(recorder.state).toBe("inactive");
    expect(recorder.record()).toBe(0); // Question 1 starts at 0
    advance(30_000);
    recorder.pause();
    advance(3_500); // question 2 audio + chime: not recorded
    expect(recorder.state).toBe("paused");
    expect(recorder.record()).toBe(30_000);
    advance(30_000);
    recorder.pause();
    advance(3_500);
    expect(recorder.record()).toBe(60_000);
    advance(30_000);
    const result = await recorder.stop();
    expect(created).toHaveLength(1);
    expect(fake.calls).toEqual(["start", "pause", "resume", "pause", "resume", "stop"]);
    expect(result?.durationMs).toBe(90_000);
    expect(result?.blob.size).toBeGreaterThan(0);
  });

  it("stop without recording gives null", async () => {
    const { recorder } = setup();
    expect(await recorder.stop()).toBeNull();
  });

  it("pause when not recording is harmless", () => {
    const { recorder, fake } = setup();
    recorder.pause();
    expect(fake.calls).toEqual([]);
  });
});
