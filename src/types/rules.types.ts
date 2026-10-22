import type { PaymentException, TriageAction } from "./models";

export type TriageInput = Pick<PaymentException, "reasonCode" | "amountCents">;

export type TriageDecision = {
  action: TriageAction;
  ruleId: string;
  rationale: string;
};
