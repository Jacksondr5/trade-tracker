import { describe, expect, it } from "vitest";
import { parseIbkrEasternTimestamp } from "../../shared/brokerage/ibkr-flex/time";
import {
  classifyIbkrExternalId,
  ibkrLogicalFillFingerprint,
  isMidnightEastern,
} from "./ibkrTradeIdentity";

describe("IBKR logical fill identity", () => {
  const fill = {
    assetType: "stock" as const,
    brokerageAccountId: " U123 ",
    date: parseIbkrEasternTimestamp("20260813;103000")!,
    direction: "long" as const,
    price: 50,
    quantity: 2,
    side: "buy" as const,
    source: "ibkr" as const,
    ticker: " arm ",
  };

  it("normalizes account and ticker while binding every economic field", () => {
    expect(ibkrLogicalFillFingerprint(fill)).toBe(
      ibkrLogicalFillFingerprint({
        ...fill,
        brokerageAccountId: "u123",
        ticker: "ARM",
      }),
    );
    for (const changed of [
      { brokerageAccountId: "U999" },
      { date: fill.date + 1 },
      { direction: "short" as const },
      { price: 51 },
      { quantity: 3 },
      { side: "sell" as const },
      { ticker: "INTC" },
    ]) {
      expect(ibkrLogicalFillFingerprint({ ...fill, ...changed })).not.toBe(
        ibkrLogicalFillFingerprint(fill),
      );
    }
  });

  it.each(["20260813", "20260813;000000"])(
    "refuses ambiguous midnight identity parsed from %s",
    (value) => {
      const date = parseIbkrEasternTimestamp(value)!;
      expect(isMidnightEastern(date)).toBe(true);
      expect(ibkrLogicalFillFingerprint({ ...fill, date })).toBeNull();
    },
  );

  it("classifies every historical identifier scheme", () => {
    expect(classifyIbkrExternalId("U1|ARM|20260813;103000|50|2")).toBe("csv");
    expect(classifyIbkrExternalId("00015e71.6a7e2fbf.01.01")).toBe("execution");
    expect(classifyIbkrExternalId("5523063596")).toBe("order");
    expect(classifyIbkrExternalId("future-scheme")).toBe("other");
  });
});
