import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";

const PORT_ERROR = "PORT must be a whole number between 1 and 65535";

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("defaults", () => {
    it("needs nothing set: port 3000 and settlement not failing", () => {
      expect(loadConfig({})).toEqual({ port: 3000, settlementFail: false });
    });
  });

  describe("PORT", () => {
    it.each([
      ["8080", 8080],
      ["1", 1],
      ["65535", 65535],
      ["3000", 3000],
    ])("accepts PORT=%s", (port, expected) => {
      expect(loadConfig({ PORT: port }).port).toBe(expected);
    });

    it.each([
      "abc",
      "0",
      "65536",
      "-1",
      "80.5",
      "",
      "1e3",
      " 80",
      "80 ",
      "+80",
      "0x50",
      "99999999999999999999",
    ])("rejects PORT=%j", (port) => {
      expect(() => loadConfig({ PORT: port })).toThrow(new Error(PORT_ERROR));
    });
  });

  describe("SETTLEMENT_FAIL", () => {
    it("forces settlement to fail when the value is true", () => {
      expect(loadConfig({ SETTLEMENT_FAIL: "true" }).settlementFail).toBe(true);
    });

    it.each(["false", "TRUE", "1", "yes", ""])("leaves settlement working for %j", (value) => {
      expect(loadConfig({ SETTLEMENT_FAIL: value }).settlementFail).toBe(false);
    });

    it("leaves settlement working when unset", () => {
      expect(loadConfig({}).settlementFail).toBe(false);
    });
  });

  describe("environment source", () => {
    it("reads process.env by default", () => {
      vi.stubEnv("PORT", "4321");
      vi.stubEnv("SETTLEMENT_FAIL", "true");

      expect(loadConfig()).toEqual({ port: 4321, settlementFail: true });
    });

    it("ignores process.env when an environment is passed in", () => {
      vi.stubEnv("PORT", "4321");
      vi.stubEnv("SETTLEMENT_FAIL", "true");

      expect(loadConfig({})).toEqual({ port: 3000, settlementFail: false });
    });
  });
});
