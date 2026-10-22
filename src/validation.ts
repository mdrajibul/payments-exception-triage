import { z } from "zod";
import type { Direction } from "./types/models";
import type { ValidationError, ValidationResult } from "./types/validation.types";

const BODY_MESSAGE = "body must be a JSON object";
const REFERENCE_MESSAGE = "reference must not be empty";
const AMOUNT_CENTS_MESSAGE = "amountCents must be a positive whole number of cents";
const CURRENCY_MESSAGE = "currency must be AUD";
const BSB_MESSAGE = "bsb must be in the format XXX-XXX using digits only";
const ACCOUNT_NUMBER_MESSAGE = "accountNumber must be 6 to 12 digits";
const REASON_CODE_MESSAGE = "reasonCode must not be empty";
const DIRECTION_MESSAGE = "direction must be INBOUND or OUTBOUND";

const DIRECTIONS = ["INBOUND", "OUTBOUND"] as const satisfies readonly Direction[];
const BSB_PATTERN = /^\d{3}-\d{3}$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{6,12}$/;

const paymentExceptionSchema = z.object({
  reference: z.string(REFERENCE_MESSAGE).refine(isNotBlank, REFERENCE_MESSAGE),
  amountCents: z
    .number(AMOUNT_CENTS_MESSAGE)
    .int(AMOUNT_CENTS_MESSAGE)
    .positive(AMOUNT_CENTS_MESSAGE),
  currency: z.literal("AUD", CURRENCY_MESSAGE),
  bsb: z.string(BSB_MESSAGE).regex(BSB_PATTERN, BSB_MESSAGE),
  accountNumber: z
    .string(ACCOUNT_NUMBER_MESSAGE)
    .regex(ACCOUNT_NUMBER_PATTERN, ACCOUNT_NUMBER_MESSAGE),
  reasonCode: z.string(REASON_CODE_MESSAGE).min(1, REASON_CODE_MESSAGE),
  direction: z.enum(DIRECTIONS, DIRECTION_MESSAGE),
});

export function validatePaymentException(input: unknown): ValidationResult {
  if (!isJsonObject(input)) {
    return { ok: false, errors: [{ field: "body", message: BODY_MESSAGE }] };
  }

  const parsed = paymentExceptionSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  return { ok: false, errors: firstErrorPerField(parsed.error.issues) };
}

function isJsonObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNotBlank(text: string): boolean {
  return text.trim().length > 0;
}

function firstErrorPerField(issues: readonly z.core.$ZodIssue[]): ValidationError[] {
  const errorsByField = new Map<string, ValidationError>();
  for (const issue of issues) {
    const field = String(issue.path[0]);
    if (!errorsByField.has(field)) {
      errorsByField.set(field, { field, message: issue.message });
    }
  }
  return [...errorsByField.values()];
}
