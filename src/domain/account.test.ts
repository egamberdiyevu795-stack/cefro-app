import { describe, expect, it } from "vitest";
import { isDeleteConfirmed, nameProblem, newPasswordProblem, normaliseName } from "./account";

describe("account rules", () => {
  it("name: 1–50 characters after trimming, no control or direction characters", () => {
    expect(normaliseName("  Aziza   Karimova ")).toBe("Aziza Karimova");
    expect(nameProblem("Aziza")).toBeNull();
    expect(nameProblem("x".repeat(50))).toBeNull();
    expect(nameProblem("x".repeat(51))).toBe("Use at most 50 characters.");
    expect(nameProblem("   ")).toBe("Enter your name.");
    expect(nameProblem(undefined)).toBe("Enter your name.");
    expect(nameProblem("Eve‮txt")).toBe("Use letters, numbers and spaces.");
    expect(nameProblem("a\nb")).toBeNull(); // a newline is whitespace: it becomes one space
  });

  it("new password: 8–128 characters, as at sign-up", () => {
    expect(newPasswordProblem("1234567")).toBe("Use at least 8 characters.");
    expect(newPasswordProblem("12345678")).toBeNull();
    expect(newPasswordProblem("x".repeat(129))).toBe("Use at most 128 characters.");
  });

  it("delete confirmation: exactly DELETE (spaces around it forgiven, case not)", () => {
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed(" DELETE ")).toBe(true);
    for (const value of ["delete", "Delete", "DELET", "DELETE!", "", undefined, null, 1]) expect(isDeleteConfirmed(value), String(value)).toBe(false);
  });
});
