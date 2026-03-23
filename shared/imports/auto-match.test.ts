import { describe, expect, it } from "vitest";
import {
  findAutoMatchTradePlanId,
  findMatchingTradePlans,
  type TradePlanMatch,
} from "./auto-match";

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

describe("findMatchingTradePlans", () => {
  const plans: TradePlanMatch[] = [
    { id: "plan1", instrumentSymbol: "AAPL" },
    { id: "plan2", instrumentSymbol: "MSFT" },
    { id: "plan3", instrumentSymbol: "AAPL" },
  ];

  it("returns all matching plans for the ticker", () => {
    expect(findMatchingTradePlans("AAPL", plans)).toEqual([
      { id: "plan1", instrumentSymbol: "AAPL" },
      { id: "plan3", instrumentSymbol: "AAPL" },
    ]);
  });

  it("matches case-insensitively", () => {
    expect(findMatchingTradePlans("msft", plans)).toEqual([
      { id: "plan2", instrumentSymbol: "MSFT" },
    ]);
  });

  it("returns an empty array when no plans match the ticker", () => {
    expect(findMatchingTradePlans("TSLA", plans)).toEqual([]);
  });

  it("returns an empty array when the plans array is empty", () => {
    expect(findMatchingTradePlans("AAPL", [])).toEqual([]);
  });

  it("returns an empty array when the ticker is missing", () => {
    expect(findMatchingTradePlans(undefined, plans)).toEqual([]);
  });
});
