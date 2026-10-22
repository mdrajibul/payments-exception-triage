import { describe, expect, it } from "vitest";
import { createInMemoryCaseStore } from "../src/store";
import type { ExceptionCase } from "../src/types/models";

function buildCase(overrides: Partial<ExceptionCase> = {}): ExceptionCase {
  return {
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
    ...overrides,
  };
}

describe("createInMemoryCaseStore", () => {
  it("finds a saved case by id", () => {
    const store = createInMemoryCaseStore();
    store.save(buildCase());

    expect(store.findById("case-1")).toEqual(buildCase());
  });

  it("returns undefined for an unknown id", () => {
    const store = createInMemoryCaseStore();

    expect(store.findById("missing")).toBeUndefined();
  });

  it("lists nothing when empty", () => {
    expect(createInMemoryCaseStore().list()).toEqual([]);
  });

  it("lists saved cases in the order they were saved", () => {
    const store = createInMemoryCaseStore();
    store.save(buildCase({ id: "case-1" }));
    store.save(buildCase({ id: "case-2" }));
    store.save(buildCase({ id: "case-3" }));

    expect(store.list().map((storedCase) => storedCase.id)).toEqual(["case-1", "case-2", "case-3"]);
  });

  it("replaces a case saved again with the same id", () => {
    const store = createInMemoryCaseStore();
    store.save(buildCase({ status: "QUEUED" }));
    store.save(buildCase({ status: "CLOSED" }));

    expect(store.list()).toHaveLength(1);
    expect(store.findById("case-1")?.status).toBe("CLOSED");
  });

  it("stores a copy so changing the saved object does not change the stored case", () => {
    const store = createInMemoryCaseStore();
    const original = buildCase();
    store.save(original);

    original.status = "CLOSED";
    original.ruleId = "TAMPERED";

    expect(store.findById("case-1")).toEqual(buildCase());
  });

  it("returns copies from findById so callers cannot change the stored case", () => {
    const store = createInMemoryCaseStore();
    store.save(buildCase());

    const found = store.findById("case-1");
    if (found) {
      found.status = "CLOSED";
    }

    expect(store.findById("case-1")).toEqual(buildCase());
  });

  it("returns copies from list so callers cannot change stored cases", () => {
    const store = createInMemoryCaseStore();
    store.save(buildCase());

    const [listed] = store.list();
    if (listed) {
      listed.status = "CLOSED";
    }
    store.list().pop();

    expect(store.list()).toEqual([buildCase()]);
  });
});
