import { describe, expect, it } from "vitest";
import { createMockSettlementClient } from "../src/settlement";

const request = { reference: "PAY-0001", amountCents: 12500, action: "QUEUE_REVIEW" } as const;

describe("createMockSettlementClient", () => {
  it("resolves when no options are given", async () => {
    const client = createMockSettlementClient();

    await expect(client.submit(request)).resolves.toBeUndefined();
  });

  it("resolves when fail is false", async () => {
    const client = createMockSettlementClient({ fail: false });

    await expect(client.submit(request)).resolves.toBeUndefined();
  });

  it("rejects with a settlement unavailable error when fail is true", async () => {
    const client = createMockSettlementClient({ fail: true });

    const rejection = client.submit(request);

    await expect(rejection).rejects.toBeInstanceOf(Error);
    await expect(rejection).rejects.toThrow("settlement unavailable");
  });

  it("rejects every request when fail is true", async () => {
    const client = createMockSettlementClient({ fail: true });

    await expect(client.submit({ ...request, action: "AUTO_CLOSE" })).rejects.toThrow(
      "settlement unavailable",
    );
    await expect(client.submit({ ...request, action: "NEEDS_HUMAN" })).rejects.toThrow(
      "settlement unavailable",
    );
  });
});
