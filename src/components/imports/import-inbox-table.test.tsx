import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportInboxTable } from "~/components/imports/import-inbox-table";

describe("ImportInboxTable", () => {
  it("renders pending imported trades with suggestion and editable selectors", () => {
    const html = renderToStaticMarkup(
      <ImportInboxTable
        campaigns={[]}
        onSave={() => {}}
        rows={[
          {
            _id: "t1",
            brokerAccountRef: "ACC-1",
            date: 1_710_000_000_000,
            price: 100,
            provider: "ibkr",
            quantity: 2,
            side: "buy",
            suggestedTradePlanId: "plan-1",
            suggestionReason: "symbol_and_side_match",
            symbol: "AAPL",
          },
        ]}
        selectedCampaignIds={{}}
        selectedTradePlanIds={{}}
        tradePlans={[]}
      />,
    );

    expect(html).toContain("ACC-1");
    expect(html).toContain("plan-1");
    expect(html).toContain("trade-plan-t1");
    expect(html).toContain("campaign-t1");
  });
});
