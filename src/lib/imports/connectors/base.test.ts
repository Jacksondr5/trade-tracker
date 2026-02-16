import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "~/lib/imports/connectors/base";

describe("normalizeSymbol", () => {
  it("normalizes case and trims whitespace", () => {
    expect(normalizeSymbol(" btcusd ")).toBe("BTCUSD");
  });
});
