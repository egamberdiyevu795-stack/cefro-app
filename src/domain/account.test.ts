import { describe, expect, it } from "vitest";
import { EMAIL_AS_NAME, accountDisplayName, emailLocalPart, isDeleteConfirmed, looksLikeEmail, nameProblem, newPasswordProblem, normaliseName, signUpNameProblem } from "./account";

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

describe("names are never built from the email", () => {
  it("a name that looks like an email address or a mail domain is refused", () => {
    expect(looksLikeEmail("ali@mail.uz")).toBe(true);
    expect(looksLikeEmail(" gmail.com ")).toBe(true);
    expect(looksLikeEmail("Ali Valiyev")).toBe(false);
    expect(looksLikeEmail("J.R. Smith")).toBe(false);
    expect(nameProblem("ali@mail.uz")).toBe(EMAIL_AS_NAME);
    expect(nameProblem("  Ali  ")).toBeNull();
    expect(nameProblem("x".repeat(51))).toBe("Use at most 50 characters.");
  });

  it("sign-up: the name is optional (empty = none); otherwise the same rules", () => {
    for (const empty of [undefined, null, "", "   "]) expect(signUpNameProblem(empty)).toBeNull();
    expect(signUpNameProblem("Nodira")).toBeNull();
    expect(signUpNameProblem("nodira@example.com")).toBe(EMAIL_AS_NAME);
    expect(signUpNameProblem("x".repeat(51))).toMatch(/50/);
    expect(signUpNameProblem(42)).toBe("Enter your name.");
  });

  it("the old sign-up form's name (the email's local part, any case) counts as no name", () => {
    expect(emailLocalPart("Ali.V@Example.com")).toBe("ali.v");
    expect(accountDisplayName("ali.v", "ali.v@example.com")).toBeNull();
    expect(accountDisplayName("Ali.V", "ali.v@example.com")).toBeNull();
    expect(accountDisplayName(null, "ali.v@example.com")).toBeNull();
    expect(accountDisplayName("   ", "ali.v@example.com")).toBeNull();
    expect(accountDisplayName("ali@example.com", "other@example.com")).toBeNull();
    expect(accountDisplayName("  Ali  Valiyev ", "ali.v@example.com")).toBe("Ali Valiyev");
  });
});
