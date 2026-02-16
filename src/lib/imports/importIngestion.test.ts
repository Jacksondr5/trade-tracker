import { describe, expect, it } from "vitest";
import { buildExecutionIdentity } from "../../../convex/lib/importIngestion";

describe("buildExecutionIdentity", () => {
  it("generates deterministic fallback hash when externalExecutionId missing", () => {
    const first = buildExecutionIdentity({
      accountRef: "acct-1",
      occurredAt: 1_710_000_000_000,
      price: 150,
      provider: "ibkr",
      quantity: 2,
      side: "buy",
      symbol: "AAPL",
      externalExecutionId: null,
    });

    const second = buildExecutionIdentity({
      accountRef: "acct-1",
      occurredAt: 1_710_000_000_000,
      price: 150,
      provider: "ibkr",
      quantity: 2,
      side: "buy",
      symbol: "AAPL",
      externalExecutionId: null,
    });

    expect(first).toEqual(second);
    expect(first.kind).toBe("hash");
  });
});
