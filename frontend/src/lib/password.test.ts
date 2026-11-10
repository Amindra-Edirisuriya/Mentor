import { describe, expect, it } from "vitest";

import { isEmail, passwordProblem, passwordStrength } from "./password";

describe("passwordProblem (mirrors the backend policy)", () => {
  it.each([
    ["abc12345", true],
    ["abcdefgh", false],
    ["12345678", false],
    ["a1".repeat(70), false],
    ["short1", false],
  ])("%s → ok=%s", (password, ok) => {
    expect(passwordProblem(password) === null).toBe(ok);
  });

  it("rejects the email as password", () => {
    expect(passwordProblem("ada@example.com", " Ada@Example.com ")).toMatch(/email/);
  });
});

describe("passwordStrength", () => {
  it("grows with length and variety", () => {
    expect(passwordStrength("abc").score).toBe(0);
    expect(passwordStrength("abcdefg1").score).toBe(1);
    expect(passwordStrength("Abcdefg1").score).toBe(2);
    expect(passwordStrength("Abcdefgh1234").score).toBe(3);
    expect(passwordStrength("Abcdefgh1234!xyz").label).toBe("Strong");
  });
});

describe("isEmail", () => {
  it("accepts simple addresses only", () => {
    expect(isEmail(" ada@example.com ")).toBe(true);
    expect(isEmail("ada@example")).toBe(false);
    expect(isEmail("ada example.com")).toBe(false);
  });
});
