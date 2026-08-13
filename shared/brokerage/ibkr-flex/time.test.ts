import { describe, expect, it } from "vitest";
import { parseIbkrEasternTimestamp } from "./time";

describe("parseIbkrEasternTimestamp", () => {
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
