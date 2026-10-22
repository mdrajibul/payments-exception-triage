import { describe, expect, it } from "vitest";
import { validatePaymentException } from "../src/validation";

const BSB_MESSAGE = "bsb must be in the format XXX-XXX using digits only";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reference: "PAY-0001",
    amountCents: 12500,
    currency: "AUD",
    bsb: "032-001",
    accountNumber: "123456789",
    reasonCode: "INSUFFICIENT_FUNDS",
    direction: "OUTBOUND",
    ...overrides,
  };
}

function withoutField(field: string): Record<string, unknown> {
  const input = validInput();
  delete input[field];
  return input;
}

function errorsFor(input: unknown) {
  const result = validatePaymentException(input);
  if (result.ok) {
    throw new Error("expected validation to fail");
  }
  return result.errors;
}

describe("validatePaymentException", () => {
  describe("valid input", () => {
    it("accepts a fully valid exception and returns it as the value", () => {
      const result = validatePaymentException(validInput());

      expect(result).toEqual({ ok: true, value: validInput() });
    });

    it("accepts INBOUND and OUTBOUND directions", () => {
      expect(validatePaymentException(validInput({ direction: "INBOUND" })).ok).toBe(true);
      expect(validatePaymentException(validInput({ direction: "OUTBOUND" })).ok).toBe(true);
    });

    it("accepts any non-empty reason code so unknown reasons reach the rule engine", () => {
      for (const reasonCode of ["SOMETHING_NEW", "duplicate_payment", " DUPLICATE_PAYMENT "]) {
        expect(validatePaymentException(validInput({ reasonCode })).ok).toBe(true);
      }
    });

    it("never changes the raw input", () => {
      const input = Object.freeze(validInput({ reference: "  PAY-0001  " }));
      const before = structuredClone(input);

      validatePaymentException(input);

      expect(input).toEqual(before);
    });
  });

  describe("each field rejected on its own", () => {
    it("rejects a blank reference", () => {
      expect(errorsFor(validInput({ reference: "" }))).toEqual([
        { field: "reference", message: "reference must not be empty" },
      ]);
    });

    it("rejects a whitespace-only reference", () => {
      expect(errorsFor(validInput({ reference: "   \t " }))).toEqual([
        { field: "reference", message: "reference must not be empty" },
      ]);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects amountCents %s",
      (amountCents) => {
        expect(errorsFor(validInput({ amountCents }))).toEqual([
          { field: "amountCents", message: "amountCents must be a positive whole number of cents" },
        ]);
      },
    );

    it.each(["USD", "aud", "AUD "])("rejects currency %j", (currency) => {
      expect(errorsFor(validInput({ currency }))).toEqual([
        { field: "currency", message: "currency must be AUD" },
      ]);
    });

    it.each(["032001", "03-2001", "032-0011", "abc-def", " 032-001", "032-001\n", "٠٣٢-٠٠١"])(
      "rejects bsb %j",
      (bsb) => {
        expect(errorsFor(validInput({ bsb }))).toEqual([{ field: "bsb", message: BSB_MESSAGE }]);
      },
    );

    it.each(["12345a789", "123 456", "-123456", "１２３４５６"])(
      "rejects non-digit account number %j",
      (accountNumber) => {
        expect(errorsFor(validInput({ accountNumber }))).toEqual([
          { field: "accountNumber", message: "accountNumber must be 6 to 12 digits" },
        ]);
      },
    );

    it("rejects an empty reason code", () => {
      expect(errorsFor(validInput({ reasonCode: "" }))).toEqual([
        { field: "reasonCode", message: "reasonCode must not be empty" },
      ]);
    });

    it.each(["SIDEWAYS", "inbound", ""])("rejects direction %j", (direction) => {
      expect(errorsFor(validInput({ direction }))).toEqual([
        { field: "direction", message: "direction must be INBOUND or OUTBOUND" },
      ]);
    });
  });

  describe("several bad fields reported together", () => {
    it("reports every bad field once, in field order", () => {
      const errors = errorsFor(
        validInput({
          reference: " ",
          amountCents: -5,
          currency: "NZD",
          bsb: "nope",
          accountNumber: "1",
          reasonCode: "",
          direction: "LEFT",
        }),
      );

      expect(errors).toEqual([
        { field: "reference", message: "reference must not be empty" },
        { field: "amountCents", message: "amountCents must be a positive whole number of cents" },
        { field: "currency", message: "currency must be AUD" },
        { field: "bsb", message: BSB_MESSAGE },
        { field: "accountNumber", message: "accountNumber must be 6 to 12 digits" },
        { field: "reasonCode", message: "reasonCode must not be empty" },
        { field: "direction", message: "direction must be INBOUND or OUTBOUND" },
      ]);
    });

    it("returns at most one error per field", () => {
      const errors = errorsFor(validInput({ amountCents: -1.5, accountNumber: "abc" }));
      const fields = errors.map((error) => error.field);

      expect(new Set(fields).size).toBe(fields.length);
      expect(fields).toEqual(["amountCents", "accountNumber"]);
    });
  });

  describe("missing fields", () => {
    it.each([
      ["reference", "reference must not be empty"],
      ["amountCents", "amountCents must be a positive whole number of cents"],
      ["currency", "currency must be AUD"],
      ["bsb", BSB_MESSAGE],
      ["accountNumber", "accountNumber must be 6 to 12 digits"],
      ["reasonCode", "reasonCode must not be empty"],
      ["direction", "direction must be INBOUND or OUTBOUND"],
    ])("rejects a missing %s", (field, message) => {
      expect(errorsFor(withoutField(field))).toEqual([{ field, message }]);
    });

    it("reports every field when the object is empty", () => {
      expect(errorsFor({}).map((error) => error.field)).toEqual([
        "reference",
        "amountCents",
        "currency",
        "bsb",
        "accountNumber",
        "reasonCode",
        "direction",
      ]);
    });
  });

  describe("wrong types", () => {
    it.each([
      ["reference", 42],
      ["reference", null],
      ["amountCents", "12500"],
      ["amountCents", null],
      ["amountCents", true],
      ["currency", 36],
      ["bsb", 32001],
      ["accountNumber", 123456789],
      ["accountNumber", null],
      ["reasonCode", 7],
      ["reasonCode", ["INSUFFICIENT_FUNDS"]],
      ["direction", 1],
      ["direction", { value: "INBOUND" }],
    ])("rejects %s given %j", (field, value) => {
      const errors = errorsFor(validInput({ [field]: value }));

      expect(errors.map((error) => error.field)).toEqual([field]);
    });
  });

  describe("boundary values", () => {
    it("accepts the smallest positive amount", () => {
      expect(validatePaymentException(validInput({ amountCents: 1 })).ok).toBe(true);
    });

    it.each([
      [5, false],
      [6, true],
      [12, true],
      [13, false],
    ])("account number of %i digits ok=%s", (length, expectedOk) => {
      const accountNumber = "1".repeat(length);

      expect(validatePaymentException(validInput({ accountNumber })).ok).toBe(expectedOk);
    });
  });

  describe("body must be a JSON object", () => {
    it.each([null, undefined, [], [validInput()], "text", 42, true])(
      "rejects %j with a single body error",
      (input) => {
        expect(errorsFor(input)).toEqual([
          { field: "body", message: "body must be a JSON object" },
        ]);
      },
    );
  });
});
