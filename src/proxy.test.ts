import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { EXAM_DEVICE_COOKIE } from "@/server/identity/user-cookie";
import { config, examDeviceAllows, proxy } from "./proxy";

/*
 * The exam laptop's device session (docs/teacher-plan.md, section 11): a browser that carries its cookie may reach only the exam
 * laptop's own screen (T7), the public files that screen plays and its own APIs. Everything else (every teacher page and API, T5 /
 * T6 / T8, recordings and results, the student pages and the Account page) answers 404, like a stranger. Without the cookie the
 * proxy behaves as before.
 */

const COOKIE = "cefro_exam_device=signed.value";
const get = (path: string, cookie?: string) => proxy(new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }));

const ALLOWED = [
  "/teacher/classes/c1/exam/m1/laptop",
  "/teacher/classes/c1/exam/m1/laptop?room=Room+2",
  "/audio/speaking/part2/intro/v1/intro.wav",
  "/audio/speaking/part1/b1-part1-2-shopping/v1/q4.wav",
  "/tasks/b2/picture.svg",
  "/favicon.ico",
  "/api/exam-laptop/m1/roster",
  "/api/exam-laptop/m1/pin",
  "/api/exam-laptop/m1/unlock",
  "/api/exam-laptop/m1/end",
  "/api/mock-exams",
  "/api/mock-exams/00000000-0000-4000-8000-000000000000/finish",
  "/api/speaking/attempts",
];

const REFUSED_PAGES = [
  "/",
  "/login",
  "/register",
  "/dashboard",
  "/profile",
  "/profile?mock=1",
  "/profile/classes/join",
  "/settings",
  "/history",
  "/practice",
  "/practice/mock",
  "/practice/mock/m1",
  "/practice/speaking/b2-part2-a-tradition",
  "/result/a1",
  "/lessons",
  "/join/ABC234",
  "/teacher/classes/new",
  "/teacher/classes/c1", // T3
  "/teacher/classes/c1/exam", // the Start page
  "/teacher/classes/c1/exam/m1", // T8
  "/teacher/classes/c1/mocks/m1", // T6
  "/teacher/classes/c1/attempts/a1", // T5
  "/teacher/classes/c1/students/s1", // T4
  "/teacher/lessons/l-t1",
  "/teacher/classes/c1/exam/m1/laptop/extra",
  "/teacher/classes/c1/exam/m1/laptop/../../..",
];

const REFUSED_APIS = [
  "/api/account/me",
  "/api/account/password",
  "/api/account/delete",
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
  "/api/classes",
  "/api/classes/lookup",
  "/api/classes/m1/pin",
  "/api/classes/m1/leave",
  "/api/teacher/classes",
  "/api/teacher/classes/c1",
  "/api/teacher/classes/c1/exam",
  "/api/teacher/classes/c1/exam/m1/results",
  "/api/teacher/classes/c1/attempts/a1",
  "/api/teacher/classes/c1/attempts/a1/audio", // the teacher's recording player
  "/api/teacher/classes/c1/mocks/m1",
  "/api/teacher/classes/c1/students/s1",
  "/api/speaking/attempts/a1",
  "/api/speaking/attempts/a1/audio", // a student's own recording
  "/api/speaking/attempts/a1/process",
  "/api/speaking/tasks/t1/attempts",
  "/api/mock-exams/m1", // a mock's status
  "/api/mock-exams/m1/result", // a mock's result
  "/api/sessions",
  "/api/analytics/events",
  "/api/cron/audio-retention",
];

describe("a browser with the exam laptop's device cookie", () => {
  it.each(ALLOWED)("may reach %s", (path) => {
    const response = get(path, COOKIE);
    expect(response.status, path).not.toBe(404);
    expect(examDeviceAllows(new URL(`http://localhost${path}`).pathname), path).toBe(true);
  });

  it.each(REFUSED_PAGES)("gets the 404 page for %s", (path) => {
    const response = get(path, COOKIE);
    expect(response.status, path).toBe(404);
    expect(response.headers.get("x-middleware-rewrite"), path).toContain("/exam-laptop-refused");
  });

  it.each(REFUSED_APIS)("gets the JSON 404 for %s", async (path) => {
    const response = get(path, COOKIE);
    expect(response.status, path).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is sent through the proxy for the refused APIs and not for the allowed ones (so uploads are not buffered)", () => {
    const entry = config.matcher[1] as { source: string; has: { type: string; key: string }[] };
    expect(entry.has).toEqual([{ type: "cookie", key: EXAM_DEVICE_COOKIE }]);
    const matches = (path: string) => new RegExp(`^${entry.source}$`).test(path);
    for (const path of REFUSED_APIS) expect(matches(path), path).toBe(true);
    for (const path of ALLOWED.filter((p) => p.startsWith("/api/"))) expect(matches(path), path).toBe(false);
  });
});

describe("a browser without it", () => {
  it.each([...REFUSED_PAGES.slice(0, 12), "/teacher/classes/c1", "/teacher/classes/c1/exam/m1/laptop"])("is not held back on %s", (path) => {
    const response = get(path);
    expect(response.status, path).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
