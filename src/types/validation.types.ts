import type { PaymentException } from "./models";

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult =
  { ok: true; value: PaymentException } | { ok: false; errors: ValidationError[] };
