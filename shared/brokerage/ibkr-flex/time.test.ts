import { describe, expect, it } from "vitest";
import { parseIbkrEasternTimestamp } from "./time";

describe("parseIbkrEasternTimestamp", () => {
  it("preserves the date-only fallback at Eastern midnight", () => {
    expect(parseIbkrEasternTimestamp("20260810")).toBe(
      Date.UTC(2026, 7, 10, 4, 0, 0),
    );
  });

  it.each([
    "20260810;093518extra",
    "20260810;093518;extra",
    "20260810;09351",
    "20260810;0935180",
    "20260810093518",
  ])("rejects non-canonical timestamp text: %s", (value) => {
    expect(parseIbkrEasternTimestamp(value)).toBeUndefined();
  });

  it("round-trips valid wall clocks immediately around the spring transition", () => {
    expect(parseIbkrEasternTimestamp("20260308;015959")).toBe(
      Date.UTC(2026, 2, 8, 6, 59, 59),
    );
    expect(parseIbkrEasternTimestamp("20260308;030000")).toBe(
      Date.UTC(2026, 2, 8, 7, 0, 0),
    );
  });

  it("moves a nonexistent spring-forward wall clock forward by the DST gap", () => {
    expect(parseIbkrEasternTimestamp("20260308;023000")).toBe(
      Date.UTC(2026, 2, 8, 7, 30, 0),
    );
  });
});
