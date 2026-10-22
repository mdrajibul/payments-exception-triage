export type Direction = "INBOUND" | "OUTBOUND";

export type PaymentException = {
  reference: string;
  amountCents: number;
  currency: "AUD";
  bsb: string;
  accountNumber: string;
  reasonCode: string;
  direction: Direction;
};
