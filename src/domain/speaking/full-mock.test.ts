import { describe, expect, it } from "vitest";
import {
  MOCK_EXPIRES_AFTER_MS,
  MOCK_PARTS,
  effectiveMockStatus,
  isMockComplete,
  mockProgressLabel,
  mockRefusal,
  nextMockPart,
  pickTaskForPart,
  remainingParts,
  type MockSession,
} from "./full-mock";

const T0 = Date.parse("2026-11-11T09:00:00.000Z");
const session = (over: Partial<MockSession> = {}): MockSession => ({ status: "in_progress", createdAt: new Date(T0).toISOString(), ...over });
const done = (...parts: string[]) => parts.map((part) => ({ part })) as { part: (typeof MOCK_PARTS)[number] }[];

describe("full mock: order", () => {
  it("is Parts 1.1, 1.2, 2, 3 in the exam's order", () => {
    expect([...MOCK_PARTS]).toEqual(["1.1", "1.2", "2", "3"]);
  });

  it("starts at Part 1.1 and moves on one finished part at a time", () => {
    expect(nextMockPart([])).toBe("1.1");
    expect(nextMockPart(done("1.1"))).toBe("1.2");
    expect(nextMockPart(done("1.1", "1.2"))).toBe("2");
    expect(nextMockPart(done("1.1", "1.2", "2"))).toBe("3");
    expect(nextMockPart(done("1.1", "1.2", "2", "3"))).toBeNull();
  });

  it("is complete only when all four parts are finished, whatever order they arrived in", () => {
    expect(isMockComplete(done("1.1", "1.2", "2"))).toBe(false);
    expect(isMockComplete(done("3", "2", "1.2", "1.1"))).toBe(true);
  });

  it("labels the thin progress line by position in the mock, not by the part's own number", () => {
    expect(MOCK_PARTS.map(mockProgressLabel)).toEqual(["Part 1 of 4", "Part 2 of 4", "Part 3 of 4", "Part 4 of 4"]);
  });
});

describe("full mock: resume", () => {
  it("plays only the parts that are not saved, in exam order", () => {
    expect(remainingParts(done("1.1", "1.2"))).toEqual(["2", "3"]);
  });

  it("goes back to a part whose upload never arrived, then on (a lost Part 1.2 is played again before Part 3)", () => {
    const saved = done("1.1", "2");
    expect(remainingParts(saved)).toEqual(["1.2", "3"]);
    expect(nextMockPart(saved)).toBe("1.2");
  });

  it("resumes a mock with nothing saved from the start, and a finished one with nothing", () => {
    expect(remainingParts([])).toEqual(["1.1", "1.2", "2", "3"]);
    expect(remainingParts(done("1.1", "1.2", "2", "3"))).toEqual([]);
  });
});

describe("full mock: the 24-hour rule", () => {
  it("is in progress right up to 24 hours, then not finished", () => {
    expect(effectiveMockStatus(session(), T0)).toBe("in_progress");
    expect(effectiveMockStatus(session(), T0 + MOCK_EXPIRES_AFTER_MS - 1)).toBe("in_progress");
    expect(effectiveMockStatus(session(), T0 + MOCK_EXPIRES_AFTER_MS)).toBe("not_finished");
    expect(effectiveMockStatus(session(), T0 + 3 * MOCK_EXPIRES_AFTER_MS)).toBe("not_finished");
  });

  it("never turns a finished mock into a not-finished one, however old", () => {
    expect(effectiveMockStatus(session({ status: "finished" }), T0 + 10 * MOCK_EXPIRES_AFTER_MS)).toBe("finished");
  });

  it("counts from when the mock started, not from the last part", () => {
    // Started 23 h ago with three parts saved: one hour left, not 24 more.
    const started = session({ createdAt: new Date(T0 - 23 * 3_600_000).toISOString() });
    expect(effectiveMockStatus(started, T0)).toBe("in_progress");
    expect(effectiveMockStatus(started, T0 + 3_600_000)).toBe("not_finished");
  });
});

describe("full mock: which recordings may join", () => {
  it("accepts an unfinished part of a mock in progress, in any order", () => {
    expect(mockRefusal(session(), done(), "1.1", T0)).toBeNull();
    expect(mockRefusal(session(), done("1.1"), "2", T0)).toBeNull(); // Part 1.2's upload is late: Part 2 may arrive first
  });

  it("takes each part once", () => {
    expect(mockRefusal(session(), done("1.1"), "1.1", T0)).toBe("part_done");
  });

  it("refuses everything after the mock ended or ran out of time, saying which", () => {
    expect(mockRefusal(session({ status: "finished" }), done("1.1", "1.2", "2", "3"), "1.1", T0)).toBe("not_in_progress");
    expect(mockRefusal(session({ status: "not_finished" }), done("1.1"), "2", T0)).toBe("not_in_progress");
    expect(mockRefusal(session(), done("1.1"), "2", T0 + MOCK_EXPIRES_AFTER_MS)).toBe("expired");
  });

  it("refuses a recording that is not one of the four parts", () => {
    expect(mockRefusal(session(), done(), null, T0)).toBe("not_a_mock_part");
  });
});

describe("full mock: the task picker", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const at = (days: number) => new Date(T0 - days * 86_400_000).toISOString();

  it("takes a task the student has never done before any they have", () => {
    const history = [{ taskId: "a", createdAt: at(1) }, { taskId: "b", createdAt: at(30) }];
    expect(pickTaskForPart(tasks, history, () => 0)?.id).toBe("c");
  });

  it("when all were done, takes the one done longest ago", () => {
    const history = [
      { taskId: "a", createdAt: at(2) },
      { taskId: "b", createdAt: at(20) },
      { taskId: "b", createdAt: at(1) }, // b's LATEST attempt is what counts
      { taskId: "c", createdAt: at(9) },
    ];
    expect(pickTaskForPart(tasks, history, () => 0)?.id).toBe("c");
  });

  it("breaks a tie with the random number, so two mocks in a row can differ", () => {
    expect(pickTaskForPart(tasks, [], () => 0)?.id).toBe("a");
    expect(pickTaskForPart(tasks, [], () => 0.5)?.id).toBe("b");
    expect(pickTaskForPart(tasks, [], () => 0.999)?.id).toBe("c");
  });

  it("copes with a part with one task or none, and ignores history of tasks it does not offer", () => {
    expect(pickTaskForPart([{ id: "only" }], [{ taskId: "only", createdAt: at(0) }])?.id).toBe("only");
    expect(pickTaskForPart([], [])).toBeNull();
    expect(pickTaskForPart(tasks, [{ taskId: "elsewhere", createdAt: at(0) }], () => 0)?.id).toBe("a");
  });
});
