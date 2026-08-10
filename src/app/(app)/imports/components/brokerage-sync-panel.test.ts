import { describe, expect, it } from "vitest";
import {
  parseExpectedAccountIds,
  toOptionalStringArrayPatch,
} from "./brokerage-sync-panel-helpers";

describe("expected account ID form helpers", () => {
  it("splits newline input and saves the parsed account IDs", () => {
    const input = " U1234567\nU7654321\nU1234567 ";

    expect(parseExpectedAccountIds(input)).toEqual([
      "U1234567",
      "U7654321",
    ]);
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
});
