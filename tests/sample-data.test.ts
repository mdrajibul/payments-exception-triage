import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createJsonLogger } from "../src/logging";
import { createTriageService } from "../src/service";
import { createMockSettlementClient } from "../src/settlement";
import { createInMemoryCaseStore } from "../src/store";

const SAMPLE_DATA_DIRECTORY = new URL("../sample-data/", import.meta.url);

const EXPECTED_JSONL_OUTCOMES = [
  { action: "QUEUE_REVIEW", ruleId: "R-NSF-001" },
  { action: "AUTO_CLOSE", ruleId: "R-DUP-001" },
  { action: "NEEDS_HUMAN", ruleId: "R-NSF-HV-001" },
  { action: "QUEUE_REVIEW", ruleId: "R-ACC-001" },
  { action: "QUEUE_REVIEW", ruleId: "R-BKU-001" },
  { action: "NEEDS_HUMAN", ruleId: "R-ABSTAIN-001" },
  { action: "QUEUE_REVIEW", ruleId: "R-NSF-001" },
  { action: "NEEDS_HUMAN", ruleId: "R-ABSTAIN-001" },
];

function readSample(fileName: string): string {
  return readFileSync(new URL(fileName, SAMPLE_DATA_DIRECTORY), "utf8");
}

function readJsonSample(fileName: string): Record<string, unknown> {
  return JSON.parse(readSample(fileName)) as Record<string, unknown>;
}

function readJsonLines(): Array<Record<string, unknown>> {
  return readSample("exceptions.jsonl")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function buildRealService() {
  return createTriageService({
    store: createInMemoryCaseStore(),
    settlement: createMockSettlementClient(),
    logger: createJsonLogger(() => undefined),
  });
}

describe("sample data through the real service", () => {
  it("queues insufficient-funds.json for review with the BSB masked", async () => {
    const input = readJsonSample("insufficient-funds.json");

    const result = await buildRealService().submit(input);

    expect(input.bsb).toBe("032-001");
    expect(result).toMatchObject({
      ok: true,
      case: {
        action: "QUEUE_REVIEW",
        status: "QUEUED",
        ruleId: "R-NSF-001",
        maskedBsb: "***-001",
      },
    });
  });

  it("auto-closes duplicate-payment.json", async () => {
    const result = await buildRealService().submit(readJsonSample("duplicate-payment.json"));

    expect(result).toMatchObject({
      ok: true,
      case: { action: "AUTO_CLOSE", status: "CLOSED", ruleId: "R-DUP-001" },
    });
  });

  it("abstains on unknown-reason.json with NEEDS_HUMAN", async () => {
    const result = await buildRealService().submit(readJsonSample("unknown-reason.json"));

    expect(result).toMatchObject({
      ok: true,
      case: { action: "NEEDS_HUMAN", status: "AWAITING_HUMAN", ruleId: "R-ABSTAIN-001" },
    });
  });

  it("rejects invalid-bsb.json with a field-level error and stores nothing", async () => {
    const input = readJsonSample("invalid-bsb.json");
    const service = buildRealService();

    const result = await service.submit(input);

    expect(input.bsb).toBe("032001");
    expect(result).toEqual({
      ok: false,
      errors: [{ field: "bsb", message: "bsb must be in the format XXX-XXX using digits only" }],
    });
    expect(service.listCases()).toEqual([]);
  });
});

describe("exceptions.jsonl", () => {
  it("has 8 lines, each a JSON object", () => {
    const lines = readJsonLines();

    expect(lines).toHaveLength(8);
    for (const line of lines) {
      expect(typeof line).toBe("object");
    }
  });

  it("gives each line its expected action and rule through the real service", async () => {
    const service = buildRealService();
    const outcomes = [];

    for (const line of readJsonLines()) {
      const result = await service.submit(line);
      if (!result.ok) {
        throw new Error(`line was rejected: ${JSON.stringify(result.errors)}`);
      }
      outcomes.push({ action: result.case.action, ruleId: result.case.ruleId });
    }

    expect(outcomes).toEqual(EXPECTED_JSONL_OUTCOMES);
  });

  it("covers queue, auto-close, high-value and unknown outcomes", async () => {
    const ruleIds = EXPECTED_JSONL_OUTCOMES.map((outcome) => outcome.ruleId);

    expect(ruleIds).toContain("R-NSF-001");
    expect(ruleIds).toContain("R-DUP-001");
    expect(ruleIds).toContain("R-NSF-HV-001");
    expect(ruleIds).toContain("R-ABSTAIN-001");
  });

  it("uses a different reference and account number on every line", () => {
    const lines = readJsonLines();

    expect(new Set(lines.map((line) => line.reference)).size).toBe(lines.length);
    expect(new Set(lines.map((line) => line.accountNumber)).size).toBe(lines.length);
  });

  it("never lets a raw account number into a stored case", async () => {
    const service = buildRealService();
    const lines = readJsonLines();

    for (const line of lines) {
      await service.submit(line);
    }

    const stored = JSON.stringify(service.listCases());
    for (const line of lines) {
      expect(stored).not.toContain(String(line.accountNumber));
    }
  });
});
