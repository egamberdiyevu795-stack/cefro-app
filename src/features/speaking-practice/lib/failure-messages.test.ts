import { describe, expect, it } from "vitest";
import { shouldAutoRestart } from "./failure-messages";

describe("shouldAutoRestart", () => {
  it("restarts stalled runs and temporary provider failures", () => {
    expect(shouldAutoRestart({ status: "processing", isStalled: true, failure: null })).toBe(true);
    expect(shouldAutoRestart({ status: "failed", isStalled: false, failure: { stage: "transcription", code: "provider_timeout" } })).toBe(true);
    expect(shouldAutoRestart({ status: "failed", isStalled: false, failure: { stage: "evaluation", code: "evaluation_failed" } })).toBe(true);
  });

  it("leaves failures that a restart cannot fix to the student", () => {
    expect(shouldAutoRestart({ status: "failed", isStalled: false, failure: { stage: "transcription", code: "transcription_empty" } })).toBe(false);
    expect(shouldAutoRestart({ status: "failed", isStalled: false, failure: { stage: null, code: "provider_not_configured" } })).toBe(false);
    expect(shouldAutoRestart({ status: "completed", isStalled: false, failure: null })).toBe(false);
  });
});
