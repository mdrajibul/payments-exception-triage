import { describe, expect, it } from "vitest";
import { triage } from "../src/rules";

const KNOWN_REASON_CODES = [
  "DUPLICATE_PAYMENT",
  "INSUFFICIENT_FUNDS",
  "INVALID_ACCOUNT",
  "BANK_UNAVAILABLE",
] as const;

const ABSTAIN_DECISION = {
  action: "NEEDS_HUMAN",
  ruleId: "R-ABSTAIN-001",
  rationale: "Unrecognised reason code; abstaining for human review, never auto-closing.",
};

describe("triage", () => {
  describe("each reason gives its full decision", () => {
    it("auto-closes a duplicate payment", () => {
      expect(triage({ reasonCode: "DUPLICATE_PAYMENT", amountCents: 5000 })).toEqual({
        action: "AUTO_CLOSE",
        ruleId: "R-DUP-001",
        rationale: "Duplicate payment reported; closing automatically.",
      });
    });

    it("queues insufficient funds for review", () => {
      expect(triage({ reasonCode: "INSUFFICIENT_FUNDS", amountCents: 5000 })).toEqual({
        action: "QUEUE_REVIEW",
        ruleId: "R-NSF-001",
        rationale: "Insufficient funds requires ops queue review before customer contact.",
      });
    });

    it("sends high-value insufficient funds to a human", () => {
      expect(triage({ reasonCode: "INSUFFICIENT_FUNDS", amountCents: 2000000 })).toEqual({
        action: "NEEDS_HUMAN",
        ruleId: "R-NSF-HV-001",
        rationale:
          "High-value insufficient funds exceeds the queue threshold; a human must review.",
      });
    });

    it("queues an invalid account for review", () => {
      expect(triage({ reasonCode: "INVALID_ACCOUNT", amountCents: 5000 })).toEqual({
        action: "QUEUE_REVIEW",
        ruleId: "R-ACC-001",
        rationale: "Invalid account details require ops queue review.",
      });
    });

    it("queues bank unavailable for review and retry", () => {
      expect(triage({ reasonCode: "BANK_UNAVAILABLE", amountCents: 5000 })).toEqual({
        action: "QUEUE_REVIEW",
        ruleId: "R-BKU-001",
        rationale: "Bank unavailable; queued for review and retry.",
      });
    });
  });

  describe("high-value boundary for insufficient funds", () => {
    it.each([
      [999999, "QUEUE_REVIEW", "R-NSF-001"],
      [1000000, "NEEDS_HUMAN", "R-NSF-HV-001"],
      [1000001, "NEEDS_HUMAN", "R-NSF-HV-001"],
    ])("amount %i gives %s via %s", (amountCents, action, ruleId) => {
      const decision = triage({ reasonCode: "INSUFFICIENT_FUNDS", amountCents });

      expect(decision.action).toBe(action);
      expect(decision.ruleId).toBe(ruleId);
    });

    it("applies the high-value rule only to INSUFFICIENT_FUNDS", () => {
      const highValue = 5000000;

      expect(triage({ reasonCode: "DUPLICATE_PAYMENT", amountCents: highValue })).toMatchObject({
        action: "AUTO_CLOSE",
        ruleId: "R-DUP-001",
      });
      expect(triage({ reasonCode: "INVALID_ACCOUNT", amountCents: highValue })).toMatchObject({
        action: "QUEUE_REVIEW",
        ruleId: "R-ACC-001",
      });
      expect(triage({ reasonCode: "BANK_UNAVAILABLE", amountCents: highValue })).toMatchObject({
        action: "QUEUE_REVIEW",
        ruleId: "R-BKU-001",
      });
    });
  });

  describe("safe abstain", () => {
    it.each([
      ["an unknown reason", "SOMETHING_NEW"],
      ["a lowercase known code", "duplicate_payment"],
      ["a mixed-case known code", "Insufficient_Funds"],
      ["a known code with leading padding", " DUPLICATE_PAYMENT"],
      ["a known code with trailing padding", "INSUFFICIENT_FUNDS "],
      ["an empty reason", ""],
      ["a whitespace-only reason", "   "],
    ])("abstains on %s", (_description, reasonCode) => {
      const decision = triage({ reasonCode, amountCents: 5000 });

      expect(decision).toEqual(ABSTAIN_DECISION);
      expect(decision.action).not.toBe("AUTO_CLOSE");
    });

    it("abstains on an unknown reason whatever the amount", () => {
      expect(triage({ reasonCode: "SOMETHING_NEW", amountCents: 1 })).toEqual(ABSTAIN_DECISION);
      expect(triage({ reasonCode: "SOMETHING_NEW", amountCents: 9000000 })).toEqual(
        ABSTAIN_DECISION,
      );
    });

    it("never auto-closes a padded or lowercase duplicate payment", () => {
      for (const reasonCode of [" DUPLICATE_PAYMENT", "DUPLICATE_PAYMENT ", "duplicate_payment"]) {
        expect(triage({ reasonCode, amountCents: 5000 }).action).not.toBe("AUTO_CLOSE");
      }
    });
  });

  describe("explainability", () => {
    const everyDecision = [
      ...KNOWN_REASON_CODES.map((reasonCode) => triage({ reasonCode, amountCents: 5000 })),
      triage({ reasonCode: "INSUFFICIENT_FUNDS", amountCents: 1000000 }),
      triage({ reasonCode: "SOMETHING_NEW", amountCents: 5000 }),
    ];

    it("gives every outcome a unique ruleId", () => {
      const ruleIds = everyDecision.map((decision) => decision.ruleId);

      expect(ruleIds).toHaveLength(6);
      expect(new Set(ruleIds).size).toBe(ruleIds.length);
    });

    it("gives every outcome a non-empty rationale", () => {
      for (const decision of everyDecision) {
        expect(decision.rationale.trim().length).toBeGreaterThan(0);
      }
    });

    it("never puts the input reasonCode in the rationale", () => {
      const reasonCodes = [...KNOWN_REASON_CODES, "SOMETHING_NEW", "secret-code-123"];

      for (const reasonCode of reasonCodes) {
        const { rationale } = triage({ reasonCode, amountCents: 5000 });

        expect(rationale).not.toContain(reasonCode);
      }
    });
  });

  describe("shared decisions stay unchanged", () => {
    it("returns a copy so changing a decision does not affect later calls", () => {
      const first = triage({ reasonCode: "DUPLICATE_PAYMENT", amountCents: 5000 });
      first.action = "NEEDS_HUMAN";
      first.ruleId = "TAMPERED";
      first.rationale = "tampered";

      expect(triage({ reasonCode: "DUPLICATE_PAYMENT", amountCents: 5000 })).toEqual({
        action: "AUTO_CLOSE",
        ruleId: "R-DUP-001",
        rationale: "Duplicate payment reported; closing automatically.",
      });
    });

    it("returns a different object on every call", () => {
      const first = triage({ reasonCode: "SOMETHING_NEW", amountCents: 5000 });
      const second = triage({ reasonCode: "SOMETHING_NEW", amountCents: 5000 });

      expect(first).not.toBe(second);
    });
  });
});
