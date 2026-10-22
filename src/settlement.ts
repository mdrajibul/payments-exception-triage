import type { MockSettlementOptions, SettlementClient } from "./types/settlement.types";

export function createMockSettlementClient({
  fail = false,
}: MockSettlementOptions = {}): SettlementClient {
  return {
    async submit() {
      if (fail) {
        throw new Error("settlement unavailable");
      }
    },
  };
}
