import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { createMockSettlementClient } from "../src/settlement";
import { createTriageService } from "../src/service";
import { createInMemoryCaseStore } from "../src/store";
import type { Logger } from "../src/types/logging.types";
import type { TriageService } from "../src/types/service.types";

const RAW_ACCOUNT_NUMBER = "123456789";
const RAW_BSB = "032-001";
const JSON_HEADERS = { "content-type": "application/json" };

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function buildLogger() {
  const info = vi.fn<Logger["info"]>();
  const warn = vi.fn<Logger["warn"]>();
  const logger: Logger = { info, warn };
  return { logger, info, warn };
}

function buildTestApp({ settlementFail = false } = {}) {
  const { logger, info, warn } = buildLogger();
  let nextId = 0;
  const service = createTriageService({
    store: createInMemoryCaseStore(),
    settlement: createMockSettlementClient({ fail: settlementFail }),
    logger,
    newId: () => `case-${++nextId}`,
    now: () => new Date("2026-10-22T04:00:00.000Z"),
  });
  return { app: buildApp({ service, logger }), service, info, warn };
}

function buildAppWithBrokenService(failure: Error) {
  const { logger, info, warn } = buildLogger();
  const service: TriageService = {
    submit: () => Promise.reject(failure),
    getCase: () => {
      throw failure;
    },
    listCases: () => {
      throw failure;
    },
  };
  return { app: buildApp({ service, logger }), info, warn };
}

function postExceptions(app: ReturnType<typeof buildApp>, payload: string) {
  return app.inject({ method: "POST", url: "/exceptions", headers: JSON_HEADERS, payload });
}

describe("HTTP API", () => {
  describe("GET /health", () => {
    it("responds 200 with status ok", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  describe("create, get and list", () => {
    it("creates a case with 201 and a masked body", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(app, JSON.stringify(validBody()));

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
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
      });
    });

    it("gets a created case by id", async () => {
      const { app } = buildTestApp();
      const created = await postExceptions(app, JSON.stringify(validBody()));

      const response = await app.inject({ method: "GET", url: "/exceptions/case-1" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(created.json());
    });

    it("lists created cases in order", async () => {
      const { app } = buildTestApp();
      await postExceptions(app, JSON.stringify(validBody({ reference: "PAY-A" })));
      await postExceptions(app, JSON.stringify(validBody({ reference: "PAY-B" })));

      const response = await app.inject({ method: "GET", url: "/exceptions" });

      expect(response.statusCode).toBe(200);
      expect(
        response.json().map((exceptionCase: { reference: string }) => exceptionCase.reference),
      ).toEqual(["PAY-A", "PAY-B"]);
    });

    it("lists an empty array before anything is created", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({ method: "GET", url: "/exceptions" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe("validation reject", () => {
    it("responds 422 with field-level errors and stores nothing", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(
        app,
        JSON.stringify(validBody({ bsb: "032001", amountCents: 0 })),
      );

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        errors: [
          { field: "amountCents", message: "amountCents must be a positive whole number of cents" },
          { field: "bsb", message: "bsb must be in the format XXX-XXX using digits only" },
        ],
      });
      const list = await app.inject({ method: "GET", url: "/exceptions" });
      expect(list.json()).toEqual([]);
    });

    it("does not echo the rejected values back", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(app, JSON.stringify(validBody({ bsb: "032001" })));

      expect(response.body).not.toContain("032001");
      expect(response.body).not.toContain(RAW_ACCOUNT_NUMBER);
    });
  });

  describe("bad request bodies", () => {
    const invalidJson = { errors: [{ field: "body", message: "body must be valid JSON" }] };

    it("responds 422 for malformed JSON", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(app, '{"reference": "PAY-0001",');

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(invalidJson);
    });

    it("responds 422 for an empty JSON body", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(app, "");

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(invalidJson);
    });

    it.each(["[]", "[1,2]", "null", "42", '"text"', "true"])(
      "responds 422 with a body error for the JSON value %s",
      async (payload) => {
        const { app } = buildTestApp();

        const response = await postExceptions(app, payload);

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          errors: [{ field: "body", message: "body must be a JSON object" }],
        });
      },
    );

    it("responds 422 with a body error when there is no body at all", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({ method: "POST", url: "/exceptions" });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        errors: [{ field: "body", message: "body must be a JSON object" }],
      });
    });

    it("keeps Fastify's default 415 for a content type it cannot parse", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/exceptions",
        headers: { "content-type": "application/xml" },
        payload: "<exception />",
      });

      expect(response.statusCode).toBe(415);
    });

    it("rejects a plain text body as not a JSON object", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({
        method: "POST",
        url: "/exceptions",
        headers: { "content-type": "text/plain" },
        payload: "hello",
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        errors: [{ field: "body", message: "body must be a JSON object" }],
      });
    });
  });

  describe("guarded outcomes", () => {
    it("abstains with NEEDS_HUMAN for an unknown reason", async () => {
      const { app } = buildTestApp();

      const response = await postExceptions(
        app,
        JSON.stringify(validBody({ reasonCode: "SOMETHING_NEW" })),
      );

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        action: "NEEDS_HUMAN",
        status: "AWAITING_HUMAN",
        ruleId: "R-ABSTAIN-001",
      });
    });

    it("still creates the case with 201 as DEGRADED when settlement fails", async () => {
      const { app } = buildTestApp({ settlementFail: true });

      const response = await postExceptions(app, JSON.stringify(validBody()));

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        action: "DEGRADED",
        status: "DEGRADED",
        ruleId: "R-DEGRADE-001",
      });
      const fetched = await app.inject({ method: "GET", url: "/exceptions/case-1" });
      expect(fetched.json()).toMatchObject({ action: "DEGRADED" });
    });
  });

  describe("not found", () => {
    it("responds 404 for an unknown case id", async () => {
      const { app } = buildTestApp();

      const response = await app.inject({ method: "GET", url: "/exceptions/missing" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "case not found" });
    });
  });

  describe("unexpected errors", () => {
    const failure = new Error("boom: database password is hunter2");

    it("responds with a generic 500 and no message, stack or body", async () => {
      const { app } = buildAppWithBrokenService(failure);

      const response = await postExceptions(app, JSON.stringify(validBody()));

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "internal error" });
      expect(response.body).not.toContain("boom");
      expect(response.body).not.toContain("hunter2");
      expect(response.body).not.toContain("stack");
      expect(response.body).not.toContain(RAW_ACCOUNT_NUMBER);
    });

    it("logs the error name and route only", async () => {
      const { app, warn } = buildAppWithBrokenService(failure);

      await postExceptions(app, JSON.stringify(validBody()));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("request failed", {
        errorName: "Error",
        route: "/exceptions",
      });
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain("boom");
      expect(logged).not.toContain("hunter2");
      expect(logged).not.toContain(RAW_ACCOUNT_NUMBER);
    });

    it("returns the same generic 500 for GET routes and logs the route pattern", async () => {
      const { app, warn } = buildAppWithBrokenService(new TypeError("kaboom"));

      const one = await app.inject({ method: "GET", url: "/exceptions/abc" });
      const list = await app.inject({ method: "GET", url: "/exceptions" });

      expect(one.statusCode).toBe(500);
      expect(one.json()).toEqual({ error: "internal error" });
      expect(list.statusCode).toBe(500);
      expect(list.json()).toEqual({ error: "internal error" });
      expect(warn).toHaveBeenNthCalledWith(1, "request failed", {
        errorName: "TypeError",
        route: "/exceptions/:id",
      });
      expect(warn).toHaveBeenNthCalledWith(2, "request failed", {
        errorName: "TypeError",
        route: "/exceptions",
      });
    });

    it("does not log request failures for ordinary client errors", async () => {
      const { app, warn } = buildTestApp();

      await postExceptions(app, "{broken");
      await app.inject({ method: "GET", url: "/exceptions/missing" });

      expect(warn).not.toHaveBeenCalledWith("request failed", expect.anything());
    });
  });

  describe("privacy", () => {
    it("never returns the raw account number or BSB from any endpoint", async () => {
      const { app } = buildTestApp();

      const created = await postExceptions(app, JSON.stringify(validBody()));
      const fetched = await app.inject({ method: "GET", url: "/exceptions/case-1" });
      const listed = await app.inject({ method: "GET", url: "/exceptions" });
      const rejected = await postExceptions(app, JSON.stringify(validBody({ amountCents: -1 })));

      for (const response of [created, fetched, listed, rejected]) {
        expect(response.body).not.toContain(RAW_ACCOUNT_NUMBER);
        expect(response.body).not.toContain(RAW_BSB);
      }
    });

    it("never returns the raw account number for a degraded case", async () => {
      const { app } = buildTestApp({ settlementFail: true });

      const created = await postExceptions(app, JSON.stringify(validBody()));
      const listed = await app.inject({ method: "GET", url: "/exceptions" });

      expect(created.body).not.toContain(RAW_ACCOUNT_NUMBER);
      expect(listed.body).not.toContain(RAW_ACCOUNT_NUMBER);
    });
  });
});
