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
      executionId: "0000e1.12345.01",
      externalId: "0000e1.12345.01",
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
      "No Trades section found",
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
              <Trade accountId="U1" symbol="KRE" dateTime="20260810;093518" buySell="BUY" openCloseIndicator="O" quantity="1" tradePrice="50" ibExecID="summer" />
              <Trade accountId="U1" symbol="KRE" dateTime="20260115;093518" buySell="SELL" openCloseIndicator="C" quantity="1" tradePrice="51" ibExecID="winter" />
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

  it("uses a stable fallback external id when an execution id is missing", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260805">
            <Trades>
              <Trade accountId="U1" symbol="MSFT" dateTime="20260805;103012" buySell="SELL" openCloseIndicator="C" quantity="-2" tradePrice="420" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades[0]).toMatchObject({
      externalId: "ibkr-flex|U1|MSFT|20260805;103012|sell|420|2",
      ticker: "MSFT",
    });
    expect(result.warnings).toContain(
      "Missing execution id for MSFT; used fallback external id",
    );
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

  it("rejects invalid overflow dates in IBKR timestamps", () => {
    const result = parseIbkrFlexActivityXml(`
      <FlexQueryResponse>
        <FlexStatements>
          <FlexStatement accountId="U1" toDate="20260514">
            <Trades>
              <Trade accountId="U1" symbol="SPY" dateTime="20261301;120000" buySell="BUY" quantity="1" tradePrice="500" ibExecID="exec-1" />
            </Trades>
          </FlexStatement>
        </FlexStatements>
      </FlexQueryResponse>
    `);

    expect(result.trades).toEqual([]);
    expect(result.errors).toContain("Trade row 1: dateTime is required");
  });
});
