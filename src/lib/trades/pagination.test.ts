import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  normalizeTradesPage,
  normalizeTradesPageSize,
} from "./pagination";

describe("normalizeTradesPage", () => {
  it("defaults to page 1 for invalid values", () => {
    expect(normalizeTradesPage(0)).toBe(1);
    expect(normalizeTradesPage(-10)).toBe(1);
    expect(normalizeTradesPage(Number.NaN)).toBe(1);
  });

  it("returns valid page values unchanged", () => {
    expect(normalizeTradesPage(5)).toBe(5);
  });

  it("floors positive decimal page values", () => {
    expect(normalizeTradesPage(3.9)).toBe(3);
  });
});

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
