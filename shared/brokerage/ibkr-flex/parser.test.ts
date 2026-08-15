import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIbkrFlexActivityXml } from "./parser";

const fixturePath = join(
  process.cwd(),
  "shared/brokerage/ibkr-flex/fixtures/activity-sample.xml",
);

describe("parseIbkrFlexActivityXml", () => {
  it("parses the sanitized multi-account shape emitted by a real Activity Flex report", () => {
    const result = parseIbkrFlexActivityXml(readFileSync(fixturePath, "utf8"));

    expect(result.errors).toEqual([]);
    expect(result.reportAccountIds).toEqual(["U1111111", "U2222222"]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      assetType: "stock",
      brokerageAccountId: "U2222222",
      currency: "USD",
      direction: "long",
      externalId: "order-1",
      fees: -1.25,
      orderType: "LMT",
      price: 190,
      quantity: 10,
      side: "buy",
      taxes: 0,
      ticker: "AAPL",
    });
    expect(result.trades[0].date).toBe(Date.UTC(2026, 7, 5, 13, 30, 5));

    expect(result.positionSnapshots).toEqual([
      {
        assetType: "stock",
        brokerageAccountId: "U2222222",
        currency: "USD",
        marketValue: 1900,
        quantity: 10,
        reportDate: "2026-08-05",
        ticker: "AAPL",
      },
      {
        assetType: "stock",
        brokerageAccountId: "U2222222",
        currency: "USD",
        marketValue: 1260,
        quantity: 3,
        reportDate: "2026-08-05",
        ticker: "MSFT",
      },
    ]);
    expect(readFileSync(fixturePath, "utf8")).toContain(
      'positionValue="1900.00"',
    );
    expect(result.cashSnapshots).toEqual([
      {
        brokerageAccountId: "U1111111",
        cash: 75,
        currency: "BASE_SUMMARY",
        reportDate: "2026-08-05",
        rowKind: "base_summary",
      },
      {
        brokerageAccountId: "U1111111",
        cash: -0.01,
        currency: "JPY",
        reportDate: "2026-08-05",
        rowKind: "currency",
      },
      {
        brokerageAccountId: "U1111111",
        cash: 75,
        currency: "USD",
        reportDate: "2026-08-05",
        rowKind: "currency",
      },
      {
        brokerageAccountId: "U2222222",
        cash: 725,
        currency: "BASE_SUMMARY",
        reportDate: "2026-08-05",
        rowKind: "base_summary",
      },
    ]);
    expect(result.warnings).toEqual([
      "No Orders section found",
      "No OpenPositions section found",
    ]);
    const emptyAccountCash = result.cashSnapshots.filter(
      (snapshot) => snapshot.brokerageAccountId === "U1111111",
    );
    const baseSummaryRows = emptyAccountCash.filter(
      (snapshot) => snapshot.rowKind === "base_summary",
    );
    const currencyRows = emptyAccountCash.filter(
      (snapshot) => snapshot.rowKind === "currency",
    );
    expect(
      baseSummaryRows.reduce((total, snapshot) => total + snapshot.cash, 0),
    ).toBe(75);
    expect(baseSummaryRows).toEqual([
      expect.objectContaining({ cash: 75, currency: "BASE_SUMMARY" }),
    ]);
    expect(
      Object.fromEntries(
        currencyRows.map((snapshot) => [snapshot.currency, snapshot.cash]),
      ),
    ).toEqual({ JPY: -0.01, USD: 75 });
  });

  it("interprets offset-free trade timestamps in America/New_York across DST", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260810">
            <Trades>
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="KRE" dateTime="20260810;093518" buySell="BUY" openCloseIndicator="O" quantity="1" tradePrice="50" ibOrderID="summer" />
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="KRE" dateTime="20260115;093518" buySell="SELL" openCloseIndicator="C" quantity="1" tradePrice="51" ibOrderID="winter" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.errors).toEqual([]);
    expect(result.trades.map((trade) => trade.date)).toEqual([
      Date.UTC(2026, 7, 10, 13, 35, 18),
      Date.UTC(2026, 0, 15, 14, 35, 18),
    ]);
  });

  it("requires ibOrderID for supported orders", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260805">
            <Trades>
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="MSFT" dateTime="20260805;103012" buySell="SELL" openCloseIndicator="C" quantity="-2" tradePrice="420" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain("Order row 1: ibOrderID is required");
  });

  it("ignores the AssetSummary row nested inside Trades", () => {
    const xml = readFileSync(fixturePath, "utf8");
    const result = parseIbkrFlexActivityXml(xml);

    expect(xml).toContain("<AssetSummary");
    expect(result.trades).toHaveLength(2);
    expect(result.errors).not.toContain("Trade row 3: symbol is required");
  });

  it("warns instead of failing when optional sections are missing", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260514">
            <Trades>
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="SPY" dateTime="20260514;120000" buySell="BUY" quantity="1" tradePrice="500" ibOrderID="order-1" />
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
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="AAPL" dateTime="20260514;120000" buySell="BUY" quantity="1" tradePrice="500" ibOrderID="order-1" />
              <Order accountId="U1" assetCategory="STK" currency="USD" dateTime="20260514;120100" buySell="SELL" quantity="1" tradePrice="501" ibOrderID="order-2" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toHaveLength(1);
    expect(result.errors).toEqual(["Order row 2: symbol is required"]);
  });

  it("rejects invalid overflow dates in IBKR timestamps", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260514">
            <Trades>
              <Order accountId="U1" assetCategory="STK" currency="USD" symbol="SPY" dateTime="20261301;120000" buySell="BUY" quantity="1" tradePrice="500" ibOrderID="order-1" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain("Order row 1: dateTime is required");
  });

  it("skips unsupported asset categories and non-USD stock orders with explicit warnings", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260810">
            <Trades>
              <Order accountId="U1" assetCategory="CRYPTO" currency="USD" symbol="BTC.USD" ibOrderID="crypto-1" />
              <Order accountId="U1" assetCategory="CASH" currency="JPY" symbol="USD.JPY" ibOrderID="cash-1" />
              <Order accountId="U1" assetCategory="STK" currency="JPY" symbol="6988" ibOrderID="japan-1" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.errors).toEqual([]);
    expect(result.trades).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "Skipped IBKR Order crypto-1 (BTC.USD): asset category CRYPTO is unsupported; only USD stock orders are supported",
        "Skipped IBKR Order cash-1 (USD.JPY): asset category CASH is unsupported; only USD stock orders are supported",
        "Skipped IBKR Order japan-1 (6988): currency JPY is unsupported; only USD stock orders are supported",
      ]),
    );
  });

  it("fails visibly when execution rows are present without Order rows", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260810">
            <Trades>
              <Trade accountId="U1" assetCategory="STK" currency="USD" symbol="KRE" dateTime="20260810;093518" buySell="BUY" quantity="1" tradePrice="50" ibExecID="exec-1" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain(
      "Trades section contains Trade rows but no Order rows; order-level ingestion requires Orders",
    );
  });
});
