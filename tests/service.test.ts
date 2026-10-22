import { describe, expect, it, vi } from "vitest";
import { createTriageService } from "../src/service";
import { createInMemoryCaseStore } from "../src/store";
import type { Logger } from "../src/types/logging.types";
import type { SettlementClient, SettlementRequest } from "../src/types/settlement.types";

const FIXED_TIME = new Date("2026-10-22T04:00:00.000Z");
const RAW_BSB = "032-001";
const RAW_ACCOUNT_NUMBER = "123456789";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reference: "PAY-0001",
    amountCents: 12500,
    currency: "AUD",
    bsb: RAW_BSB,
    accountNumber: RAW_ACCOUNT_NUMBER,
    reasonCode: "INSUFFICIENT_FUNDS",
    direction: "OUTBOUND",
    ...overrides,
  };
}

function buildSettlement(fail = false) {
  const submit = vi.fn<(request: SettlementRequest) => Promise<void>>();
  if (fail) {
    submit.mockRejectedValue(new Error("settlement unavailable"));
  } else {
    submit.mockResolvedValue(undefined);
  }
  const settlement: SettlementClient = { submit };
  return { settlement, submit };
}

function buildLogger() {
  const info = vi.fn<Logger["info"]>();
  const warn = vi.fn<Logger["warn"]>();
  const logger: Logger = { info, warn };
  return { logger, info, warn };
}

function buildService({ fail = false } = {}) {
  const store = createInMemoryCaseStore();
  const { settlement, submit } = buildSettlement(fail);
  const { logger, info, warn } = buildLogger();
  let nextId = 0;
  const service = createTriageService({
    store,
    settlement,
    logger,
    newId: () => `case-${++nextId}`,
    now: () => FIXED_TIME,
  });
  return { service, store, submit, info, warn };
}

function everythingLogged(...mocks: Array<ReturnType<typeof vi.fn>>): string {
  return JSON.stringify(mocks.flatMap((mock) => mock.mock.calls));
}

describe("createTriageService", () => {
  describe("submit: happy path", () => {
    it("triages a valid exception into a masked, stored case", async () => {
      const { service } = buildService();

      const result = await service.submit(validInput());

      expect(result).toEqual({
        ok: true,
        case: {
          id: "case-1",
          reference: "PAY-0001",
          amountCents: 12500,
          currency: "AUD",
          maskedBsb: "***-001",
          maskedAccountNumber: "******789",
          reasonCode: "INSUFFICIENT_FUNDS",
          direction: "OUTBOUND",
          action: "QUEUE_REVIEW",
          status: "QUEUED",
          ruleId: "R-NSF-001",
          rationale: "Insufficient funds requires ops queue review before customer contact.",
          createdAt: "2026-10-22T04:00:00.000Z",
        },
      });
    });

    it("stores the case so it can be found and listed", async () => {
      const { service, store } = buildService();

      const result = await service.submit(validInput());

      expect(result.ok).toBe(true);
      expect(store.list()).toHaveLength(1);
      expect(service.getCase("case-1")).toEqual(store.findById("case-1"));
      expect(service.listCases()).toEqual(store.list());
    });

    it("logs an info line with the case summary", async () => {
      const { service, info, warn } = buildService();

      await service.submit(validInput());

      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith("exception triaged", {
        caseId: "case-1",
        reference: "PAY-0001",
        action: "QUEUE_REVIEW",
        status: "QUEUED",
        ruleId: "R-NSF-001",
      });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("submit: action and status", () => {
    it.each([
      ["DUPLICATE_PAYMENT", 5000, "AUTO_CLOSE", "CLOSED", "R-DUP-001"],
      ["INSUFFICIENT_FUNDS", 5000, "QUEUE_REVIEW", "QUEUED", "R-NSF-001"],
      ["INSUFFICIENT_FUNDS", 1000000, "NEEDS_HUMAN", "AWAITING_HUMAN", "R-NSF-HV-001"],
      ["INVALID_ACCOUNT", 5000, "QUEUE_REVIEW", "QUEUED", "R-ACC-001"],
      ["BANK_UNAVAILABLE", 5000, "QUEUE_REVIEW", "QUEUED", "R-BKU-001"],
      ["SOMETHING_NEW", 5000, "NEEDS_HUMAN", "AWAITING_HUMAN", "R-ABSTAIN-001"],
    ])(
      "%s at %i cents gives %s with status %s",
      async (reasonCode, amountCents, action, status, ruleId) => {
        const { service } = buildService();

        const result = await service.submit(validInput({ reasonCode, amountCents }));

        expect(result).toMatchObject({ ok: true, case: { action, status, ruleId } });
      },
    );

    it("takes the rationale from the triage decision", async () => {
      const { service } = buildService();

      const result = await service.submit(validInput({ reasonCode: "DUPLICATE_PAYMENT" }));

      expect(result).toMatchObject({
        ok: true,
        case: { rationale: "Duplicate payment reported; closing automatically." },
      });
    });
  });

  describe("submit: settlement", () => {
    it("sends every valid case to settlement, including AUTO_CLOSE", async () => {
      const { service, submit } = buildService();

      await service.submit(
        validInput({ reference: "PAY-DUP", reasonCode: "DUPLICATE_PAYMENT", amountCents: 700 }),
      );

      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledWith({
        reference: "PAY-DUP",
        amountCents: 700,
        action: "AUTO_CLOSE",
      });
    });

    it.each([
      ["INSUFFICIENT_FUNDS", 5000, "QUEUE_REVIEW"],
      ["INSUFFICIENT_FUNDS", 2000000, "NEEDS_HUMAN"],
      ["SOMETHING_NEW", 5000, "NEEDS_HUMAN"],
    ])(
      "sends the decision action for %s at %i cents as %s",
      async (reasonCode, amountCents, action) => {
        const { service, submit } = buildService();

        await service.submit(validInput({ reasonCode, amountCents }));

        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action }));
      },
    );

    it("never sends the raw BSB or account number to settlement", async () => {
      const { service, submit } = buildService();

      await service.submit(validInput());

      const sent = JSON.stringify(submit.mock.calls);
      expect(sent).not.toContain(RAW_BSB);
      expect(sent).not.toContain(RAW_ACCOUNT_NUMBER);
    });
  });

  describe("submit: degrade when settlement is unavailable", () => {
    it("still creates and stores the case as DEGRADED", async () => {
      const { service, store } = buildService({ fail: true });

      const result = await service.submit(validInput());

      expect(result).toMatchObject({
        ok: true,
        case: {
          id: "case-1",
          action: "DEGRADED",
          status: "DEGRADED",
          ruleId: "R-DEGRADE-001",
          rationale: "Settlement unavailable; case degraded and held for retry.",
          reasonCode: "INSUFFICIENT_FUNDS",
          maskedBsb: "***-001",
          maskedAccountNumber: "******789",
          createdAt: "2026-10-22T04:00:00.000Z",
        },
      });
      expect(store.list()).toHaveLength(1);
      expect(service.getCase("case-1")).toMatchObject({ action: "DEGRADED", status: "DEGRADED" });
    });

    it("degrades an AUTO_CLOSE decision instead of closing it", async () => {
      const { service } = buildService({ fail: true });

      const result = await service.submit(validInput({ reasonCode: "DUPLICATE_PAYMENT" }));

      expect(result).toMatchObject({ ok: true, case: { action: "DEGRADED", status: "DEGRADED" } });
    });

    it("logs a warning with the intended action and rule", async () => {
      const { service, info, warn } = buildService({ fail: true });

      await service.submit(validInput());

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("settlement unavailable, case degraded", {
        caseId: "case-1",
        reference: "PAY-0001",
        action: "DEGRADED",
        status: "DEGRADED",
        ruleId: "R-DEGRADE-001",
        intendedAction: "QUEUE_REVIEW",
        intendedRuleId: "R-NSF-001",
      });
      expect(info).not.toHaveBeenCalled();
    });

    it("logs the intended outcome the triage chose, not a fixed one", async () => {
      const { service, warn } = buildService({ fail: true });

      await service.submit(validInput({ reasonCode: "SOMETHING_NEW" }));

      expect(warn).toHaveBeenCalledWith(
        "settlement unavailable, case degraded",
        expect.objectContaining({ intendedAction: "NEEDS_HUMAN", intendedRuleId: "R-ABSTAIN-001" }),
      );
    });
  });

  describe("submit: rejected input", () => {
    it("returns the validation errors and stores and settles nothing", async () => {
      const { service, store, submit } = buildService();

      const result = await service.submit(validInput({ bsb: "032001", amountCents: -1 }));

      expect(result).toEqual({
        ok: false,
        errors: [
          { field: "amountCents", message: "amountCents must be a positive whole number of cents" },
          { field: "bsb", message: "bsb must be in the format XXX-XXX using digits only" },
        ],
      });
      expect(store.list()).toEqual([]);
      expect(submit).not.toHaveBeenCalled();
    });

    it("rejects a body that is not a JSON object", async () => {
      const { service, store, submit } = buildService();

      const result = await service.submit("not an object");

      expect(result).toEqual({
        ok: false,
        errors: [{ field: "body", message: "body must be a JSON object" }],
      });
      expect(store.list()).toEqual([]);
      expect(submit).not.toHaveBeenCalled();
    });

    it("logs a warning with the invalid field names only", async () => {
      const { service, info, warn } = buildService();

      await service.submit(validInput({ bsb: "032001", amountCents: -1 }));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("exception rejected", {
        invalidFields: ["amountCents", "bsb"],
      });
      expect(info).not.toHaveBeenCalled();
    });

    it("never logs the rejected values", async () => {
      const { service, info, warn } = buildService();

      await service.submit(
        validInput({ bsb: "032001", accountNumber: "12345678", reference: " " }),
      );

      const logged = everythingLogged(info, warn);
      expect(logged).not.toContain("032001");
      expect(logged).not.toContain("12345678");
    });
  });

  describe("masking and privacy", () => {
    it("masks before persisting so the store never holds the raw values", async () => {
      const { service, store } = buildService();

      await service.submit(validInput());

      const [stored] = store.list();
      expect(stored).toMatchObject({ maskedBsb: "***-001", maskedAccountNumber: "******789" });
      const storedText = JSON.stringify(store.list());
      expect(storedText).not.toContain(RAW_BSB);
      expect(storedText).not.toContain(RAW_ACCOUNT_NUMBER);
    });

    it("has no raw bsb or accountNumber field on the returned case", async () => {
      const { service } = buildService();

      const result = await service.submit(validInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.case).sort()).toEqual(
          [
            "action",
            "amountCents",
            "createdAt",
            "currency",
            "direction",
            "id",
            "maskedAccountNumber",
            "maskedBsb",
            "rationale",
            "reasonCode",
            "reference",
            "ruleId",
            "status",
          ].sort(),
        );
        expect(JSON.stringify(result)).not.toContain(RAW_BSB);
        expect(JSON.stringify(result)).not.toContain(RAW_ACCOUNT_NUMBER);
      }
    });

    it.each([false, true])("never logs the raw values (settlement fail=%s)", async (fail) => {
      const { service, info, warn } = buildService({ fail });

      await service.submit(validInput());

      const logged = everythingLogged(info, warn);
      expect(logged).not.toContain(RAW_BSB);
      expect(logged).not.toContain(RAW_ACCOUNT_NUMBER);
    });
  });

  describe("injected id and clock", () => {
    it("uses the injected id generator for each case", async () => {
      const { service } = buildService();

      await service.submit(validInput({ reference: "PAY-A" }));
      await service.submit(validInput({ reference: "PAY-B" }));

      expect(service.listCases().map((exceptionCase) => exceptionCase.id)).toEqual([
        "case-1",
        "case-2",
      ]);
    });

    it("uses the injected clock for createdAt", async () => {
      const store = createInMemoryCaseStore();
      const { settlement } = buildSettlement();
      const { logger } = buildLogger();
      const service = createTriageService({
        store,
        settlement,
        logger,
        newId: () => "case-fixed",
        now: () => new Date("2030-01-02T03:04:05.678Z"),
      });

      await service.submit(validInput());

      expect(service.getCase("case-fixed")?.createdAt).toBe("2030-01-02T03:04:05.678Z");
    });

    it("defaults to a random UUID and the real clock", async () => {
      const { settlement } = buildSettlement();
      const { logger } = buildLogger();
      const service = createTriageService({
        store: createInMemoryCaseStore(),
        settlement,
        logger,
      });
      const before = Date.now();

      const result = await service.submit(validInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.case.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(new Date(result.case.createdAt).toISOString()).toBe(result.case.createdAt);
        expect(Date.parse(result.case.createdAt)).toBeGreaterThanOrEqual(before);
      }
    });
  });

  describe("getCase and listCases", () => {
    it("returns undefined for an unknown case id", () => {
      const { service } = buildService();

      expect(service.getCase("missing")).toBeUndefined();
    });

    it("lists nothing before any submission", () => {
      const { service } = buildService();

      expect(service.listCases()).toEqual([]);
    });

    it("lists cases in submission order, including degraded ones", async () => {
      const { service } = buildService();
      await service.submit(validInput({ reference: "PAY-A" }));
      await service.submit(validInput({ reference: "PAY-B", reasonCode: "DUPLICATE_PAYMENT" }));

      expect(service.listCases().map((exceptionCase) => exceptionCase.reference)).toEqual([
        "PAY-A",
        "PAY-B",
      ]);
    });
  });
});
