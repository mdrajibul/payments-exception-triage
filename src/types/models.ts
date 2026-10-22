export type Direction = "INBOUND" | "OUTBOUND";

export type TriageAction = "AUTO_CLOSE" | "QUEUE_REVIEW" | "NEEDS_HUMAN";

export type PaymentException = {
  reference: string;
  amountCents: number;
  currency: "AUD";
  bsb: string;
  accountNumber: string;
  reasonCode: string;
  direction: Direction;
};
