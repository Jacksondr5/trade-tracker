import { XMLParser } from "fast-xml-parser";
import type {
  IbkrFlexCashSnapshot,
  IbkrFlexParseResult,
  IbkrFlexPositionSnapshot,
  IbkrFlexTrade,
} from "./types";
import {
  assertIbkrEasternTimezoneAvailable,
  parseIbkrEasternTimestamp,
} from "./time";

type UnknownRecord = Record<string, unknown>;

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  trimValues: true,
});

function asRecord(value: unknown): UnknownRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return undefined;
}

function asArray(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    const records: UnknownRecord[] = [];
    for (const item of value) {
      const record = asRecord(item);
      if (record) records.push(record);
    }
    return records;
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number") return String(value);
  return undefined;
}

function firstText(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return undefined;
}

function numberFrom(record: UnknownRecord, keys: string[]): number | undefined {
  const raw = firstText(record, keys);
  if (!raw) return undefined;
  const normalized = raw.replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredNumber(
  record: UnknownRecord,
  keys: string[],
  fieldName: string,
): number {
  const parsed = numberFrom(record, keys);
  if (parsed === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  return parsed;
}

function normalizeTicker(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase() || undefined;
}

function reportDateFromStatement(statement: UnknownRecord): string | undefined {
  const fromDate = firstText(statement, [
    "toDate",
    "whenGenerated",
    "fromDate",
  ]);
  if (!fromDate) return undefined;
  const compact = (
    fromDate.includes(";") ? fromDate.split(";")[0] : fromDate
  )?.trim();
  if (!compact || !/^\d{8}$/.test(compact)) return undefined;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function inferSide(value: string | undefined): "buy" | "sell" | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "BUY" || normalized === "BOT" || normalized === "B") {
    return "buy";
  }
  if (normalized === "SELL" || normalized === "SLD" || normalized === "S") {
    return "sell";
  }
  return undefined;
}

function inferDirection(args: {
  openClose: string | undefined;
  side: "buy" | "sell";
}): "long" | "short" | undefined {
  const openClose = args.openClose?.trim().toUpperCase();
  if ((openClose === "O" || openClose === "OPEN") && args.side === "buy") {
    return "long";
  }
  if ((openClose === "O" || openClose === "OPEN") && args.side === "sell") {
    return "short";
  }
  if ((openClose === "C" || openClose === "CLOSE") && args.side === "sell") {
    return "long";
  }
  if ((openClose === "C" || openClose === "CLOSE") && args.side === "buy") {
    return "short";
  }
  return undefined;
}

function fallbackExternalId(args: {
  accountId: string;
  dateTime: string | undefined;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
}): string {
  return [
    "ibkr-flex",
    args.accountId,
    args.ticker,
    args.dateTime ?? "unknown-date",
    args.side,
    args.price,
    args.quantity,
  ].join("|");
}

function findFlexStatements(root: UnknownRecord): UnknownRecord[] {
  const response = asRecord(root.FlexQueryResponse) ?? root;
  const statementsWrapper = asRecord(response.FlexStatements);
  return asArray(statementsWrapper?.FlexStatement ?? response.FlexStatement);
}

function childRows(
  statement: UnknownRecord,
  wrapperKey: string,
  rowKey: string,
): UnknownRecord[] {
  const wrapper = asRecord(statement[wrapperKey]);
  return asArray(wrapper?.[rowKey]);
}

function parseTrade(
  row: UnknownRecord,
  statement: UnknownRecord,
): { trade?: IbkrFlexTrade; warnings: string[] } {
  const warnings: string[] = [];
  const accountId = firstText(row, ["accountId", "acctId", "ibAccountId"]);
  const ticker = normalizeTicker(
    firstText(row, ["symbol", "underlyingSymbol", "description"]),
  );
  const dateTime = firstText(row, ["dateTime", "tradeDateTime", "tradeDate"]);
  const side = inferSide(firstText(row, ["buySell", "side"]));
  const openClose = firstText(row, [
    "openCloseIndicator",
    "openClose",
    "openCloseIndicatorCode",
  ]);

  if (!accountId) throw new Error("accountId is required");
  if (!ticker) throw new Error("symbol is required");
  if (!side) throw new Error("buySell is required");

  const price = requiredNumber(row, ["tradePrice", "price"], "tradePrice");
  const quantity = Math.abs(
    requiredNumber(row, ["quantity", "qty"], "quantity"),
  );
  const date = parseIbkrEasternTimestamp(dateTime);
  if (date === undefined) throw new Error("dateTime is required");

  const direction = inferDirection({ openClose, side });
  if (!direction) {
    warnings.push(
      `Could not infer direction for ${ticker} ${dateTime ?? reportDateFromStatement(statement) ?? ""}`.trim(),
    );
  }

  const executionId = firstText(row, [
    "ibExecID",
    "ibExecId",
    "execID",
    "executionId",
  ]);
  const externalId =
    executionId ??
    fallbackExternalId({
      accountId,
      dateTime,
      price,
      quantity,
      side,
      ticker,
    });
  if (!executionId) {
    warnings.push(
      `Missing execution id for ${ticker}; used fallback external id`,
    );
  }

  return {
    trade: {
      assetType: "stock",
      brokerageAccountId: accountId,
      currency: firstText(row, ["currency"]),
      date,
      direction,
      executionId,
      externalId,
      fees: numberFrom(row, ["ibCommission", "commission", "fees"]),
      orderType: firstText(row, ["orderType"]),
      price,
      quantity,
      side,
      taxes: numberFrom(row, ["taxes"]),
      ticker,
    },
    warnings,
  };
}

function parsePosition(
  row: UnknownRecord,
  reportDate: string,
): IbkrFlexPositionSnapshot {
  const accountId = firstText(row, ["accountId", "acctId", "ibAccountId"]);
  const ticker = normalizeTicker(
    firstText(row, ["symbol", "underlyingSymbol", "description"]),
  );
  if (!accountId) throw new Error("accountId is required");
  if (!ticker) throw new Error("symbol is required");

  return {
    assetType: "stock",
    brokerageAccountId: accountId,
    currency: firstText(row, ["currency"]),
    marketValue: numberFrom(row, ["positionValue", "marketValue", "value"]),
    quantity: requiredNumber(row, ["position", "quantity", "qty"], "position"),
    reportDate,
    ticker,
  };
}

function parseCash(
  row: UnknownRecord,
  reportDate: string,
): IbkrFlexCashSnapshot {
  const accountId = firstText(row, ["accountId", "acctId", "ibAccountId"]);
  const currency = firstText(row, ["currency"]);
  if (!accountId) throw new Error("accountId is required");
  if (!currency) throw new Error("currency is required");

  return {
    brokerageAccountId: accountId,
    cash: requiredNumber(
      row,
      ["endingCash", "totalCash", "settledCash", "cash"],
      "cash",
    ),
    currency,
    reportDate,
    rowKind:
      currency.trim().toUpperCase() === "BASE_SUMMARY"
        ? "base_summary"
        : "currency",
  };
}

export function parseIbkrFlexActivityXml(xml: string): IbkrFlexParseResult {
  assertIbkrEasternTimezoneAvailable();

  const result: IbkrFlexParseResult = {
    cashSnapshots: [],
    errors: [],
    positionSnapshots: [],
    reportAccountIds: [],
    trades: [],
    warnings: [],
  };

  let root: UnknownRecord;
  try {
    root = asRecord(parser.parse(xml)) ?? {};
  } catch (error) {
    return {
      ...result,
      errors: [
        `XML parse error: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const statements = findFlexStatements(root);
  if (statements.length === 0) {
    return { ...result, errors: ["No FlexStatement section found"] };
  }

  const reportAccountIds = new Set<string>();
  for (const statement of statements) {
    const statementAccountId = firstText(statement, [
      "accountId",
      "acctId",
      "ibAccountId",
    ]);
    if (statementAccountId) reportAccountIds.add(statementAccountId);
    const reportDate = reportDateFromStatement(statement);
    if (!reportDate) {
      result.errors.push("FlexStatement is missing a report date");
      continue;
    }

    const tradeRows = childRows(statement, "Trades", "Trade");
    const positionRows = childRows(statement, "OpenPositions", "OpenPosition");
    const cashRows = childRows(statement, "CashReport", "CashReportCurrency");

    if (tradeRows.length === 0) result.warnings.push("No Trades section found");
    if (positionRows.length === 0) {
      result.warnings.push("No OpenPositions section found");
    }
    if (cashRows.length === 0)
      result.warnings.push("No CashReport section found");

    for (const [index, row] of tradeRows.entries()) {
      try {
        const parsed = parseTrade(row, statement);
        if (parsed.trade) result.trades.push(parsed.trade);
        result.warnings.push(...parsed.warnings);
      } catch (error) {
        result.errors.push(
          `Trade row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const [index, row] of positionRows.entries()) {
      try {
        result.positionSnapshots.push(parsePosition(row, reportDate));
      } catch (error) {
        result.errors.push(
          `OpenPosition row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const [index, row] of cashRows.entries()) {
      try {
        result.cashSnapshots.push(parseCash(row, reportDate));
      } catch (error) {
        result.errors.push(
          `CashReportCurrency row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  result.reportAccountIds = Array.from(reportAccountIds);
  return result;
}
