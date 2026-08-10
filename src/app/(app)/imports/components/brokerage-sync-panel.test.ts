import { describe, expect, it } from "vitest";
import { IMPORTS_INDEX_TEST_IDS } from "../../../../../shared/e2e/testIds";
import {
  hasInFlightRetryAfterCurrentFailure,
  hasCurrentSyncFailure,
  parseExpectedAccountIds,
  toOptionalStringArrayPatch,
} from "./brokerage-sync-panel-helpers";

describe("expected account ID form helpers", () => {
  it("splits newline input and saves the parsed account IDs", () => {
    const input = " U1234567\nU7654321\nU1234567 ";

    expect(parseExpectedAccountIds(input)).toEqual(["U1234567", "U7654321"]);
    expect(
      toOptionalStringArrayPatch({
        cleared: false,
        fieldName: "Expected account IDs",
        persistedValue: undefined,
        value: input,
      }),
    ).toEqual({
      kind: "set",
      value: ["U1234567", "U7654321"],
    });
  });

  it("identifies a failure that is newer than the last successful sync", () => {
    expect(
      hasCurrentSyncFailure({
        lastFailedSyncAt: 2,
        lastSuccessfulSyncAt: 1,
      }),
    ).toBe(true);
    expect(
      hasCurrentSyncFailure({
        lastFailedSyncAt: 1,
        lastSuccessfulSyncAt: 2,
      }),
    ).toBe(false);
    expect(
      hasCurrentSyncFailure({
        lastFailedSyncAt: undefined,
        lastSuccessfulSyncAt: undefined,
      }),
    ).toBe(false);
  });

  it("identifies an in-flight retry after a current failure", () => {
    expect(
      hasInFlightRetryAfterCurrentFailure({
        currentSyncFailure: true,
        latestSyncRunStatus: "waiting_for_statement",
      }),
    ).toBe(true);
    expect(
      hasInFlightRetryAfterCurrentFailure({
        currentSyncFailure: true,
        latestSyncRunStatus: "succeeded",
      }),
    ).toBe(false);
    expect(
      hasInFlightRetryAfterCurrentFailure({
        currentSyncFailure: false,
        latestSyncRunStatus: "queued",
      }),
    ).toBe(false);
  });

  it("registers the current-failure badge in the shared selector contract", () => {
    expect(IMPORTS_INDEX_TEST_IDS.brokerageCurrentFailureBadge).toBe(
      "brokerage-current-failure-badge",
    );
  });
});
