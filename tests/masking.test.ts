import { describe, expect, it } from "vitest";
import { maskAccountNumber, maskBsb } from "../src/masking";

describe("maskBsb", () => {
  it.each([
    ["032-001", "***-001"],
    ["062-000", "***-000"],
    ["733-456", "***-456"],
  ])("masks %s as %s", (bsb, expected) => {
    expect(maskBsb(bsb)).toBe(expected);
  });

  it("never reveals the first three digits", () => {
    expect(maskBsb("032-001")).not.toContain("032");
  });
});

describe("maskAccountNumber", () => {
  it.each([
    ["123456", "***456"],
    ["123456789", "******789"],
    ["123456789012", "*********012"],
  ])("masks %s as %s", (accountNumber, expected) => {
    expect(maskAccountNumber(accountNumber)).toBe(expected);
  });

  it("keeps the same length as the original", () => {
    for (const accountNumber of ["123456", "1234567", "123456789012"]) {
      expect(maskAccountNumber(accountNumber)).toHaveLength(accountNumber.length);
    }
  });

  it("keeps only the last three digits", () => {
    const masked = maskAccountNumber("987654321");

    expect(masked.replaceAll("*", "")).toBe("321");
  });
});
