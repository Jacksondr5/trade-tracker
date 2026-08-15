import { describe, expect, it } from "vitest";
import { deriveIbkrOrderMigration } from "./derive-ibkr-order-migration.mjs";

const xml = `
  <FlexQueryResponse>
    <FlexStatements>
      <FlexStatement>
        <Trades>
          <Trade ibExecID="exec-2" ibOrderID="order-1" />
          <Trade ibExecID="exec-1" ibOrderID="order-1" />
          <Order accountId="U1" assetCategory="STK" buySell="BUY" currency="USD" dateTime="20260810;093518" ibCommission="-1" ibOrderID="order-1" openCloseIndicator="O" orderType="MKT" quantity="5" symbol="KRE" tradePrice="106" />
        </Trades>
      </FlexStatement>
    </FlexStatements>
  </FlexQueryResponse>
`;

describe("derive IBKR order migration payload", () => {
  it("joins exact Trade execution ids to the authoritative Order row", () => {
    expect(deriveIbkrOrderMigration(xml, ["exec-1", "exec-2"])).toEqual({
      orders: [
        {
          assetCategory: "STK",
          brokerageAccountId: "U1",
          buySell: "BUY",
          currency: "USD",
          executionIds: ["exec-1", "exec-2"],
          fees: -1,
          openCloseIndicator: "O",
          orderId: "order-1",
          orderType: "MKT",
          price: 106,
          quantity: 5,
          rawDateTime: "20260810;093518",
          taxes: undefined,
          ticker: "KRE",
        },
      ],
    });
  });

  it("refuses a partial order group", () => {
    expect(() => deriveIbkrOrderMigration(xml, ["exec-1"])).toThrow(
      "Order order-1 is only partially selected; omitted executions: exec-2",
    );
  });

  it("refuses malformed execution input before deriving the mapping", () => {
    expect(() => deriveIbkrOrderMigration(xml, [undefined])).toThrow(
      "Execution id at index 0 must be a string",
    );
  });
});
