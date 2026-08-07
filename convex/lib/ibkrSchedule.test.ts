import { describe, expect, it } from "vitest";
import {
  getIbkrPollDelayMs,
  getNightlyKickoffDelayMs,
  getPriorBusinessDate,
  ONE_HOUR_MS,
} from "./ibkrSchedule";

describe("IBKR nightly Eastern schedule", () => {
  it("starts immediately at 05:00 UTC during daylight time", () => {
    expect(getNightlyKickoffDelayMs(Date.UTC(2026, 6, 15, 5, 0, 0))).toBe(0);
  });

  it("durably delays one hour at 05:00 UTC during standard time", () => {
    expect(getNightlyKickoffDelayMs(Date.UTC(2026, 0, 15, 5, 0, 0))).toBe(
      ONE_HOUR_MS,
    );
  });

  it("fires only on the first 1 a.m. during the fall-back transition", () => {
    expect(getNightlyKickoffDelayMs(Date.UTC(2026, 10, 1, 5, 0, 0))).toBe(0);
  });

  it("resolves the preceding weekday in Eastern time", () => {
    expect(getPriorBusinessDate(Date.UTC(2026, 4, 18, 5, 0, 0))).toBe(
      "2026-05-15",
    );
    expect(getPriorBusinessDate(Date.UTC(2026, 4, 19, 5, 0, 0))).toBe(
      "2026-05-18",
    );
  });

  it("exponentially backs off polling and caps the delay", () => {
    expect(
      [1, 2, 3, 4, 5].map((attempt) =>
        getIbkrPollDelayMs({
          attempt,
          initialPollIntervalMs: 60_000,
          maxPollIntervalMs: 8 * 60_000,
        }),
      ),
    ).toEqual([60_000, 120_000, 240_000, 480_000, 480_000]);
  });
});
