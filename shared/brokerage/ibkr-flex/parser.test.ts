import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIbkrFlexActivityXml } from "./parser";

const fixturePath = join(
  process.cwd(),
  "shared/brokerage/ibkr-flex/fixtures/activity-sample.xml",
);

describe("parseIbkrFlexActivityXml", () => {
  it("parses trades, positions, and cash snapshots from a sanitized Activity Flex report", () => {
    const result = parseIbkrFlexActivityXml(readFileSync(fixturePath, "utf8"));

    expect(result.errors).toEqual([]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      assetType: "stock",
      brokerageAccountId: "U1234567",
      currency: "USD",
      direction: "long",
      executionId: "0000e1.12345.01",
      externalId: "0000e1.12345.01",
      fees: -1.25,
      orderType: "LMT",
      price: 189.5,
      quantity: 10,
      side: "buy",
      taxes: 0,
      ticker: "AAPL",
    });
    expect(result.trades[0].date).toBe(Date.UTC(2026, 4, 14, 9, 30, 5));

    expect(result.positionSnapshots).toEqual([
      {
        assetType: "stock",
        brokerageAccountId: "U1234567",
        currency: "USD",
        marketValue: 1895,
        quantity: 10,
        reportDate: "2026-05-14",
        ticker: "AAPL",
      },
      {
        assetType: "stock",
        brokerageAccountId: "U1234567",
        currency: "USD",
        marketValue: 1260.3,
        quantity: 3,
        reportDate: "2026-05-14",
        ticker: "MSFT",
      },
    ]);
    expect(result.cashSnapshots).toEqual([
      {
        brokerageAccountId: "U1234567",
        cash: 12500.25,
        currency: "USD",
        reportDate: "2026-05-14",
      },
    ]);
  });

  it("uses a stable fallback external id when an execution id is missing", () => {
    const result = parseIbkrFlexActivityXml(readFileSync(fixturePath, "utf8"));

    expect(result.trades[1]).toMatchObject({
      externalId: "ibkr-flex|U1234567|MSFT|20260514;103012|420.1|2",
      ticker: "MSFT",
    });
    expect(result.warnings).toContain(
      "Missing execution id for MSFT; used fallback external id",
    );
  });

  it("warns instead of failing when optional sections are missing", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260514">
            <Trades>
              <Trade accountId="U1" symbol="SPY" dateTime="20260514;120000" buySell="BUY" quantity="1" tradePrice="500" ibExecID="exec-1" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.errors).toEqual([]);
    expect(result.positionSnapshots).toEqual([]);
    expect(result.cashSnapshots).toEqual([]);
    expect(result.warnings).toContain("No OpenPositions section found");
    expect(result.warnings).toContain("No CashReport section found");
    expect(result.warnings).toContain(
      "Could not infer direction for SPY 20260514;120000",
    );
  });

  it("collects row-level errors without discarding the whole report", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260514">
            <Trades>
              <Trade accountId="U1" symbol="AAPL" dateTime="20260514;120000" buySell="BUY" quantity="1" tradePrice="500" ibExecID="exec-1" />
              <Trade accountId="U1" dateTime="20260514;120100" buySell="SELL" quantity="1" tradePrice="501" ibExecID="exec-2" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toHaveLength(1);
    expect(result.errors).toEqual(["Trade row 2: symbol is required"]);
  });
});
