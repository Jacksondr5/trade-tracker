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
});
