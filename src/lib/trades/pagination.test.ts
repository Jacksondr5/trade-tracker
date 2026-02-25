import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  decodeCursorHistory,
  encodeCursorHistory,
  normalizeTradesCursor,
  normalizeTradesPageSize,
} from "./pagination";

describe("normalizeTradesPageSize", () => {
  it("accepts supported page sizes", () => {
    expect(normalizeTradesPageSize(10)).toBe(10);
    expect(normalizeTradesPageSize(25)).toBe(25);
    expect(normalizeTradesPageSize(50)).toBe(50);
    expect(normalizeTradesPageSize(100)).toBe(100);
  });

  it("falls back to default page size for unsupported values", () => {
    expect(normalizeTradesPageSize(20)).toBe(DEFAULT_TRADES_PAGE_SIZE);
    expect(normalizeTradesPageSize(Number.NaN)).toBe(DEFAULT_TRADES_PAGE_SIZE);
  });
});

describe("normalizeTradesCursor", () => {
  it("normalizes empty values to null", () => {
    expect(normalizeTradesCursor(null)).toBeNull();
    expect(normalizeTradesCursor("")).toBeNull();
    expect(normalizeTradesCursor("   ")).toBeNull();
  });

  it("returns trimmed cursor values", () => {
    expect(normalizeTradesCursor(" abc ")).toBe("abc");
  });
});

describe("cursor history helpers", () => {
  it("encodes and decodes cursor arrays", () => {
    const history = [null, "abc123", "a,b/c?d=e", "cursor with spaces"];
    const encoded = encodeCursorHistory(history);
    expect(encoded).not.toBeNull();
    expect(decodeCursorHistory(encoded)).toEqual(history);
  });

  it("uses empty values for empty history", () => {
    expect(encodeCursorHistory([])).toBeNull();
    expect(decodeCursorHistory(null)).toEqual([]);
    expect(decodeCursorHistory("")).toEqual([]);
  });
});
