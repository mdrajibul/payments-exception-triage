import type { PaymentException, TriageAction } from "./models";

export type SettlementRequest = Pick<PaymentException, "reference" | "amountCents"> & {
  action: TriageAction;
};

export type SettlementClient = {
  submit(request: SettlementRequest): Promise<void>;
};

export type MockSettlementOptions = {
  fail?: boolean;
};
