export type Direction = "INBOUND" | "OUTBOUND";

export type TriageAction = "AUTO_CLOSE" | "QUEUE_REVIEW" | "NEEDS_HUMAN";

export type CaseAction = TriageAction | "DEGRADED";

export type CaseStatus = "CLOSED" | "QUEUED" | "AWAITING_HUMAN" | "DEGRADED";

export type PaymentException = {
  reference: string;
  amountCents: number;
  currency: "AUD";
  bsb: string;
  accountNumber: string;
  reasonCode: string;
  direction: Direction;
};

export type ExceptionCase = {
  id: string;
  reference: string;
  amountCents: number;
  currency: "AUD";
  maskedBsb: string;
  maskedAccountNumber: string;
  reasonCode: string;
  direction: Direction;
  action: CaseAction;
  status: CaseStatus;
  ruleId: string;
  rationale: string;
  createdAt: string;
};
