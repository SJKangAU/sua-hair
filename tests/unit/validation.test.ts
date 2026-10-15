// tests/unit/validation.test.ts
// Unit tests for the optional-email validator used by the booking form.
import { describe, expect, it } from "vitest";
import { validateEmail } from "../../src/lib/validation";

describe("validateEmail", () => {
  it("treats an empty or whitespace-only value as valid (field is optional)", () => {
    expect(validateEmail("")).toBe(true);
    expect(validateEmail("   ")).toBe(true);
  });

  it("accepts ordinary addresses", () => {
    expect(validateEmail("jane@example.com")).toBe(true);
    expect(validateEmail("jane.doe+hair@mail.example.com.au")).toBe(true);
    expect(validateEmail("  jane@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("jane")).toBe(false);
    expect(validateEmail("jane@")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("jane@example")).toBe(false);
    expect(validateEmail("jane @example.com")).toBe(false);
    expect(validateEmail("jane@@example.com")).toBe(false);
  });

  it("rejects addresses longer than 254 characters", () => {
    expect(validateEmail("a".repeat(250) + "@x.co")).toBe(false);
  });
});
