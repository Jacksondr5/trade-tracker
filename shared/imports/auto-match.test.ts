import { describe, expect, it } from "vitest";
import { findAutoMatchTradePlanId } from "./auto-match";

interface TradePlanMatch {
  id: string;
  instrumentSymbol: string;
}

describe("findAutoMatchTradePlanId", () => {
  const plans: TradePlanMatch[] = [
    { id: "plan1", instrumentSymbol: "AAPL" },
    { id: "plan2", instrumentSymbol: "MSFT" },
    { id: "plan3", instrumentSymbol: "GOOG" },
  ];

  it("returns the plan ID when exactly one plan matches the ticker", () => {
    expect(findAutoMatchTradePlanId("AAPL", plans)).toBe("plan1");
  });

  it("returns undefined when no plan matches the ticker", () => {
    expect(findAutoMatchTradePlanId("TSLA", plans)).toBeUndefined();
  });

  it("returns undefined when multiple plans match the ticker", () => {
    const plansWithDuplicate = [
      ...plans,
      { id: "plan4", instrumentSymbol: "AAPL" },
    ];
    expect(
      findAutoMatchTradePlanId("AAPL", plansWithDuplicate),
    ).toBeUndefined();
  });

  it("returns undefined when ticker is undefined", () => {
    expect(findAutoMatchTradePlanId(undefined, plans)).toBeUndefined();
  });

  it("returns undefined when ticker is empty string", () => {
    expect(findAutoMatchTradePlanId("", plans)).toBeUndefined();
  });

  it("matches case-insensitively", () => {
    expect(findAutoMatchTradePlanId("aapl", plans)).toBe("plan1");
  });

  it("returns undefined when plans array is empty", () => {
    expect(findAutoMatchTradePlanId("AAPL", [])).toBeUndefined();
  });
});
