import { describe, expect, it } from "vitest";
import { filterLegacyStatementWarnings } from "./display-validation-warnings";

describe("filterLegacyStatementWarnings", () => {
  it("hides only legacy statement diagnostics from trade warning badges", () => {
    expect(
      filterLegacyStatementWarnings([
        "No Orders section found",
        "No OpenPositions section found",
        "No CashReport section found",
        "No Trades section found",
        "Could not infer direction for SPY 20260514;120000",
      ]),
    ).toEqual(["Could not infer direction for SPY 20260514;120000"]);
  });
});
