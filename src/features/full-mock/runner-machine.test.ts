import { describe, expect, it } from "vitest";
import { currentPart, initialRunState, runReducer, type RunAction, type RunState } from "./runner-machine";

const run = (state: RunState, ...actions: RunAction[]) => actions.reduce(runReducer, state);

describe("mock runner state", () => {
  it("a new mock plays all four parts in exam order, one after another, then waits for the uploads", () => {
    let state = run(initialRunState([]), { type: "begin" }, { type: "started", finished: [] });
    const played: (string | null)[] = [];
    for (const part of ["1.1", "1.2", "2", "3"] as const) {
      expect(state.phase).toBe("playing");
      played.push(currentPart(state));
      state = run(state, { type: "partRecorded", part });
    }
    expect(played).toEqual(["1.1", "1.2", "2", "3"]);
    expect(state.phase).toBe("sending");
    expect(currentPart(state)).toBeNull();
    expect(run(state, { type: "allSent" }).phase).toBe("done");
  });

  it("continuing plays only the parts that are not saved", () => {
    const state = run(initialRunState(["1.1", "1.2"]), { type: "begin" }, { type: "started", finished: ["1.1", "1.2"] });
    expect(state.queue).toEqual(["2", "3"]);
    expect(currentPart(state)).toBe("2");
  });

  it("trusts the server's list of saved parts over the page's (another tab finished one)", () => {
    const state = run(initialRunState([]), { type: "begin" }, { type: "started", finished: ["1.1"] });
    expect(state.queue).toEqual(["1.2", "2", "3"]);
  });

  it("goes straight to sending when the server already holds every part", () => {
    expect(run(initialRunState([]), { type: "begin" }, { type: "started", finished: ["1.1", "1.2", "2", "3"] }).phase).toBe("sending");
  });

  it("a failed start returns to the start screen with the reason, and can be tried again", () => {
    const failed = run(initialRunState([]), { type: "begin" }, { type: "startFailed", message: "offline" });
    expect(failed).toMatchObject({ phase: "ready", error: "offline" });
    expect(run(failed, { type: "begin" })).toMatchObject({ phase: "starting", error: null });
  });

  it("ignores a part that is not on screen, a repeated report, and actions out of order", () => {
    const playing = run(initialRunState([]), { type: "begin" }, { type: "started", finished: [] });
    expect(run(playing, { type: "partRecorded", part: "2" })).toBe(playing);
    const second = run(playing, { type: "partRecorded", part: "1.1" });
    expect(run(second, { type: "partRecorded", part: "1.1" })).toBe(second);
    expect(runReducer(initialRunState([]), { type: "started", finished: [] }).phase).toBe("ready");
    expect(runReducer(playing, { type: "begin" })).toBe(playing);
    expect(runReducer(playing, { type: "allSent" })).toBe(playing);
  });
});
