import { describe, expect, it } from "vitest";
import {
  MAX_PIN_FAILURES,
  PASS_MS,
  addFailure,
  classMockTitle,
  clearFailuresOn,
  isLaptopId,
  isLockedAnywhere,
  isLockedOn,
  isPin,
  normaliseRoomLabel,
  parsePinFailures,
  passExpiry,
  passRefusal,
  pickable,
  placeLabel,
  placeOfMock,
  rosterState,
  rosterStateLabel,
  serialisePinFailures,
  suggestClassPaper,
  type PassRow,
} from "./exam-laptop";

/*
 * The exam laptop's rules (docs/v1-plan.md section 6), pure: the pass (wrong student, expired, used up, other laptop, locked),
 * the PIN lock, the list's three states and what makes a name tappable, the "same paper" suggestion, In class / At home.
 */

const NOW = Date.parse("2026-11-12T10:00:00.000Z");
const L1 = "laptop-one-aaaaaaaaaaaa";
const L2 = "laptop-two-bbbbbbbbbbbb";
const pass = (over: Partial<PassRow> = {}): PassRow => ({ classMockId: "cm", studentUserId: "aziza", laptopId: L1, sessionId: null, expiresAt: passExpiry(NOW), usedUpAt: null, ...over });
const use = (over: Partial<Parameters<typeof passRefusal>[1]> = {}) => ({ classMockId: "cm", laptopId: L1, now: NOW + 60_000, locked: false, classMockClosed: false, ...over });

describe("the one-mock pass", () => {
  it("lasts about 30 minutes", () => {
    expect(PASS_MS).toBe(30 * 60 * 1000);
    expect(Date.parse(passExpiry(NOW)) - NOW).toBe(PASS_MS);
  });

  it("works for its own student, on its own laptop, for its own class mock, within the time", () => {
    expect(passRefusal(pass(), use())).toBeNull();
    expect(passRefusal(pass(), use({ studentUserId: "aziza" }))).toBeNull();
    expect(passRefusal(pass(), use({ now: NOW + PASS_MS - 1 }))).toBeNull();
  });

  it("is refused for another student", () => expect(passRefusal(pass(), use({ studentUserId: "bekzod" }))).toBe("wrong_student"));
  it("is refused once expired (the very moment it runs out too)", () => {
    expect(passRefusal(pass(), use({ now: NOW + PASS_MS }))).toBe("expired");
    expect(passRefusal(pass(), use({ now: NOW + PASS_MS + 1 }))).toBe("expired");
  });
  it("is refused once used up, even if time is left", () => expect(passRefusal(pass({ usedUpAt: new Date(NOW).toISOString() }), use())).toBe("used_up"));
  it("is refused from another laptop", () => expect(passRefusal(pass(), use({ laptopId: L2 }))).toBe("other_laptop"));
  it("is refused for another class mock", () => expect(passRefusal(pass(), use({ classMockId: "other" }))).toBe("other_class_mock"));
  it("stops at once when the student is locked on this laptop", () => expect(passRefusal(pass(), use({ locked: true }))).toBe("locked"));
  it("is refused when the class mock is closed and a new start was asked", () => expect(passRefusal(pass(), use({ classMockClosed: true }))).toBe("class_mock_closed"));
});

describe("the PIN", () => {
  it("is exactly four digits", () => {
    for (const ok of ["0000", "1234", "9999"]) expect(isPin(ok), ok).toBe(true);
    for (const bad of ["123", "12345", "12a4", " 123", "１２３４", "", 1234, null, undefined]) expect(isPin(bad), String(bad)).toBe(false);
  });

  it("locks a student after 5 wrong PINs on one laptop, and only on that laptop", () => {
    let failures = parsePinFailures(null);
    for (let i = 1; i < MAX_PIN_FAILURES; i++) {
      failures = addFailure(failures, L1);
      expect(isLockedOn(failures, L1), `after ${i}`).toBe(false);
    }
    failures = addFailure(failures, L1);
    expect(isLockedOn(failures, L1)).toBe(true);
    expect(isLockedOn(failures, L2)).toBe(false);
    expect(isLockedAnywhere(failures)).toBe(true);
  });

  it("also locks everywhere after 10 wrong PINs across laptops (no walking from room to room)", () => {
    // 4 + 4 + 2 spread over three laptops: none has 5, but the total is 10.
    let spread = parsePinFailures(null);
    for (const [laptop, n] of [["a", 4], ["b", 4], ["c", 2]] as const) for (let i = 0; i < n; i++) spread = addFailure(spread, laptop);
    expect(isLockedOn(spread, "a")).toBe(true);
    expect(isLockedOn(spread, "z")).toBe(true);
  });

  it("a correct PIN clears that laptop's count only", () => {
    let failures = addFailure(addFailure(parsePinFailures(null), L1), L2);
    failures = clearFailuresOn(failures, L1);
    expect(failures).toEqual({ [L2]: 1 });
  });

  it("is stored as small JSON and read back; nothing unreadable ever locks anyone out", () => {
    const stored = serialisePinFailures({ [L1]: 3, [L2]: 0 });
    expect(stored).toBe(JSON.stringify({ [L1]: 3 }));
    expect(parsePinFailures(stored)).toEqual({ [L1]: 3 });
    expect(serialisePinFailures({})).toBeNull();
    for (const junk of ["not json", "[1,2]", '"x"', '{"a":"b"}', '{"a":-1}', '{"a":1.5}']) expect(parsePinFailures(junk), junk).toEqual({});
  });
});

describe("the list", () => {
  it("is Not started, In progress (Room 2) or Done; a finished mock wins over an open pass", () => {
    expect(rosterState({ finished: false, activeRoom: null })).toBe("not_started");
    expect(rosterState({ finished: false, activeRoom: "Room 2" })).toBe("in_progress");
    expect(rosterState({ finished: true, activeRoom: "Room 2" })).toBe("done");
    expect(rosterStateLabel("in_progress", "Room 2")).toBe("In progress (Room 2)");
    expect(rosterStateLabel("done", null)).toBe("Done");
    expect(rosterStateLabel("not_started", null)).toBe("Not started");
  });

  it("a student in progress on the other laptop can't be picked; on this laptop (a reload) they can; done and no-PIN can't", () => {
    const base = { finished: false, activeRoom: null, hasPin: true, laptopId: L1, activeLaptopId: null };
    expect(pickable(base)).toBe(true);
    expect(pickable({ ...base, activeRoom: "Room 2", activeLaptopId: L2 })).toBe(false);
    expect(pickable({ ...base, activeRoom: "Room 1", activeLaptopId: L1 })).toBe(true);
    expect(pickable({ ...base, finished: true })).toBe(false);
    expect(pickable({ ...base, hasPin: false })).toBe(false);
    expect(pickable({ ...base, lockedHere: true })).toBe(false); // locked on this laptop: the name is text until the teacher unlocks
  });
});

describe("laptop names and ids", () => {
  it("room labels are 1 to 20 plain characters", () => {
    expect(normaliseRoomLabel("  Room   2 ")).toBe("Room 2");
    expect(normaliseRoomLabel("")).toBeNull();
    expect(normaliseRoomLabel("x".repeat(21))).toBeNull();
    expect(normaliseRoomLabel("a\nb")).toBe("a b");
    expect(normaliseRoomLabel(5)).toBeNull();
  });
  it("a laptop id is 16 to 64 safe characters", () => {
    expect(isLaptopId(L1)).toBe(true);
    for (const bad of ["short", "has space 0123456789", "x".repeat(65), "../../etc/passwd/0000", null]) expect(isLaptopId(bad), String(bad)).toBe(false);
  });
});

describe("the same-paper suggestion", () => {
  const tasks = (part: string) => [1, 2, 3].map((n) => ({ id: `${part}-${n}`, title: `${part} ${n}` }));
  it("picks, for every part, a task nobody in the class has done", () => {
    const history = [
      { taskId: "1.1-1", createdAt: "2026-11-01T00:00:00.000Z" },
      { taskId: "1.1-2", createdAt: "2026-11-02T00:00:00.000Z" },
      { taskId: "2-1", createdAt: "2026-11-03T00:00:00.000Z" },
      { taskId: "2-3", createdAt: "2026-11-03T00:00:00.000Z" },
    ];
    for (const r of [0, 0.5, 0.99]) {
      const paper = suggestClassPaper((part) => tasks(part), history, () => r);
      expect(paper).toMatchObject({ "1.1": "1.1-3", "2": "2-2" });
      expect(Object.keys(paper).sort()).toEqual(["1.1", "1.2", "2", "3"]);
    }
  });
  it("falls back to the one done longest ago when every task was done", () => {
    const history = [
      { taskId: "2-1", createdAt: "2026-11-05T00:00:00.000Z" },
      { taskId: "2-2", createdAt: "2026-11-01T00:00:00.000Z" },
      { taskId: "2-3", createdAt: "2026-11-09T00:00:00.000Z" },
    ];
    expect(suggestClassPaper((part) => tasks(part), history, () => 0)["2"]).toBe("2-2");
  });
});

describe("In class / At home, and titles", () => {
  it("a mock taken on the laptop is In class, any other At home", () => {
    expect(placeLabel(placeOfMock("cm-1"))).toBe("In class");
    expect(placeLabel(placeOfMock(null))).toBe("At home");
    expect(placeLabel(placeOfMock(undefined))).toBe("At home");
  });
  it("class mocks are numbered from the earlier ones", () => {
    expect(classMockTitle(0)).toBe("Mock 1");
    expect(classMockTitle(2)).toBe("Mock 3");
  });
});
