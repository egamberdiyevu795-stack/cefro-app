import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { LOST_AFTER_NOT_FOUND, isAttemptNotFound, nextNotFoundCount } from "./attempt-lost";

const notFound = new ApiError("http", "attempt_not_found", "This attempt could not be found.", 404);
const serverError = new ApiError("http", "internal_error", "Something went wrong.", 500);
const offline = new ApiError("network", "network", "We couldn't reach CEFRO.");

describe("attempt lost detection", () => {
  it("only a 404 answer from the server counts as not found", () => {
    expect(isAttemptNotFound(notFound)).toBe(true);
    expect(isAttemptNotFound(serverError)).toBe(false);
    expect(isAttemptNotFound(offline)).toBe(false);
    expect(isAttemptNotFound(new Error("boom"))).toBe(false);
  });

  it("gives up after consecutive not-found answers", () => {
    let count = 0;
    for (let i = 0; i < LOST_AFTER_NOT_FOUND; i++) count = nextNotFoundCount(count, { ok: false, error: notFound });
    expect(count).toBe(LOST_AFTER_NOT_FOUND);
  });

  it("a successful poll resets the count", () => {
    expect(nextNotFoundCount(2, { ok: true })).toBe(0);
  });

  it("network blips and temporary server errors neither add to nor reset the count", () => {
    expect(nextNotFoundCount(2, { ok: false, error: offline })).toBe(2);
    expect(nextNotFoundCount(2, { ok: false, error: serverError })).toBe(2);
    expect(nextNotFoundCount(0, { ok: false, error: offline })).toBe(0);
  });
});
