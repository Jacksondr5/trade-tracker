import { describe, expect, it } from "vitest";
import { pickTradePlanSuggestion } from "~/lib/imports/suggestion";

describe("pickTradePlanSuggestion", () => {
  it("returns none when there are no candidate plans", () => {
    const result = pickTradePlanSuggestion({
      execution: { side: "buy", symbol: "AAPL" },
      tradePlans: [],
    });

    expect(result).toEqual({ reason: "none", suggestedTradePlanId: null });
  });

  it("suggests plan when symbol and side-direction are consistent", () => {
    const result = pickTradePlanSuggestion({
      execution: { side: "buy", symbol: "AAPL" },
      tradePlans: [{ _id: "p1", direction: "long", instrumentSymbol: "AAPL" }],
    });

    expect(result).toEqual({
      reason: "symbol_and_side_match",
      suggestedTradePlanId: "p1",
    });
  });

  it("returns none when symbol matches but side-direction conflicts", () => {
    const result = pickTradePlanSuggestion({
      execution: { side: "sell", symbol: "AAPL" },
      tradePlans: [{ _id: "p1", direction: "long", instrumentSymbol: "AAPL" }],
    });

    expect(result).toEqual({ reason: "none", suggestedTradePlanId: null });
  });
});
