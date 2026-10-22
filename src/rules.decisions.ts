import type { TriageDecision } from "./types/rules.types";

export const DUPLICATE_PAYMENT_DECISION = {
  action: "AUTO_CLOSE",
  ruleId: "R-DUP-001",
  rationale: "Duplicate payment reported; closing automatically.",
} as const satisfies TriageDecision;

export const INSUFFICIENT_FUNDS_DECISION = {
  action: "QUEUE_REVIEW",
  ruleId: "R-NSF-001",
  rationale: "Insufficient funds requires ops queue review before customer contact.",
} as const satisfies TriageDecision;

export const HIGH_VALUE_INSUFFICIENT_FUNDS_DECISION = {
  action: "NEEDS_HUMAN",
  ruleId: "R-NSF-HV-001",
  rationale: "High-value insufficient funds exceeds the queue threshold; a human must review.",
} as const satisfies TriageDecision;

export const INVALID_ACCOUNT_DECISION = {
  action: "QUEUE_REVIEW",
  ruleId: "R-ACC-001",
  rationale: "Invalid account details require ops queue review.",
} as const satisfies TriageDecision;

export const BANK_UNAVAILABLE_DECISION = {
  action: "QUEUE_REVIEW",
  ruleId: "R-BKU-001",
  rationale: "Bank unavailable; queued for review and retry.",
} as const satisfies TriageDecision;

export const ABSTAIN_DECISION = {
  action: "NEEDS_HUMAN",
  ruleId: "R-ABSTAIN-001",
  rationale: "Unrecognised reason code; abstaining for human review, never auto-closing.",
} as const satisfies TriageDecision;
