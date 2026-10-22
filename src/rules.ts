import {
  ABSTAIN_DECISION,
  BANK_UNAVAILABLE_DECISION,
  DUPLICATE_PAYMENT_DECISION,
  HIGH_VALUE_INSUFFICIENT_FUNDS_DECISION,
  INSUFFICIENT_FUNDS_DECISION,
  INVALID_ACCOUNT_DECISION,
} from "./rules.decisions";
import type { TriageDecision, TriageInput } from "./types/rules.types";

const HIGH_VALUE_THRESHOLD_CENTS = 1000000;

export function triage(input: TriageInput): TriageDecision {
  return { ...chooseDecision(input) };
}

function chooseDecision({ reasonCode, amountCents }: TriageInput): TriageDecision {
  switch (reasonCode) {
    case "DUPLICATE_PAYMENT":
      return DUPLICATE_PAYMENT_DECISION;
    case "INSUFFICIENT_FUNDS":
      return isHighValue(amountCents)
        ? HIGH_VALUE_INSUFFICIENT_FUNDS_DECISION
        : INSUFFICIENT_FUNDS_DECISION;
    case "INVALID_ACCOUNT":
      return INVALID_ACCOUNT_DECISION;
    case "BANK_UNAVAILABLE":
      return BANK_UNAVAILABLE_DECISION;
    default:
      return ABSTAIN_DECISION;
  }
}

function isHighValue(amountCents: number): boolean {
  return amountCents >= HIGH_VALUE_THRESHOLD_CENTS;
}
