import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  trimValues: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function requiredText(row, field, label) {
  const value = String(row[field] ?? "").trim();
  if (!value) throw new Error(`${label} is missing ${field}`);
  return value;
}

function optionalText(row, field) {
  const value = String(row[field] ?? "").trim();
  return value || undefined;
}

function requiredNumber(row, field, label) {
  const value = Number(requiredText(row, field, label).replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new Error(`${label} has invalid ${field}`);
  return value;
}

function optionalNumber(row, field, label) {
  const raw = optionalText(row, field);
  if (raw === undefined) return undefined;
  const value = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new Error(`${label} has invalid ${field}`);
  return value;
}

export function deriveIbkrOrderMigration(xml, requestedExecutionIds) {
  const executionIds = requestedExecutionIds.map((value, index) => {
    if (typeof value !== "string") {
      throw new Error(`Execution id at index ${index} must be a string`);
    }
    return value.trim();
  });
  if (
    executionIds.length === 0 ||
    executionIds.some((value) => !value) ||
    new Set(executionIds).size !== executionIds.length
  ) {
    throw new Error("Execution ids must be non-empty and unique");
  }

  const root = parser.parse(xml);
  const statements = asArray(
    root.FlexQueryResponse?.FlexStatements?.FlexStatement ??
      root.FlexStatements?.FlexStatement ??
      root.FlexStatement,
  );
  const tradeRows = statements.flatMap((statement) =>
    asArray(statement.Trades?.Trade),
  );
  const orderRows = statements.flatMap((statement) =>
    asArray(statement.Trades?.Order),
  );
  const tradesByExecution = new Map();
  for (const row of tradeRows) {
    const executionId = optionalText(row, "ibExecID");
    if (!executionId) continue;
    if (tradesByExecution.has(executionId)) {
      throw new Error(`Duplicate Trade ibExecID ${executionId}`);
    }
    tradesByExecution.set(executionId, row);
  }
  const ordersById = new Map();
  for (const row of orderRows) {
    const orderId = optionalText(row, "ibOrderID");
    if (!orderId) continue;
    if (ordersById.has(orderId)) {
      throw new Error(`Duplicate Order ibOrderID ${orderId}`);
    }
    ordersById.set(orderId, row);
  }

  const requested = new Set(executionIds);
  const groups = new Map();
  for (const executionId of executionIds) {
    const trade = tradesByExecution.get(executionId);
    if (!trade) throw new Error(`Missing Trade row for ${executionId}`);
    const orderId = requiredText(trade, "ibOrderID", `Trade ${executionId}`);
    const group = groups.get(orderId) ?? [];
    group.push(executionId);
    groups.set(orderId, group);
  }

  const orders = [...groups.entries()]
    .map(([orderId, groupExecutionIds]) => {
      const allReportExecutionIds = tradeRows
        .filter((row) => String(row.ibOrderID ?? "").trim() === orderId)
        .map((row) => requiredText(row, "ibExecID", `Trade for ${orderId}`))
        .sort();
      const selectedExecutionIds = [...groupExecutionIds].sort();
      if (
        allReportExecutionIds.length !== selectedExecutionIds.length ||
        allReportExecutionIds.some(
          (executionId, index) => executionId !== selectedExecutionIds[index],
        )
      ) {
        const omitted = allReportExecutionIds.filter(
          (executionId) => !requested.has(executionId),
        );
        throw new Error(
          `Order ${orderId} is only partially selected; omitted executions: ${omitted.join(", ") || "unknown"}`,
        );
      }
      const row = ordersById.get(orderId);
      if (!row) throw new Error(`Missing Order row for ibOrderID ${orderId}`);
      const label = `Order ${orderId}`;
      return {
        assetCategory: requiredText(row, "assetCategory", label),
        brokerageAccountId: requiredText(row, "accountId", label),
        buySell: requiredText(row, "buySell", label),
        currency: requiredText(row, "currency", label),
        executionIds: selectedExecutionIds,
        fees: optionalNumber(row, "ibCommission", label),
        openCloseIndicator: optionalText(row, "openCloseIndicator"),
        orderId,
        orderType: optionalText(row, "orderType"),
        price: requiredNumber(row, "tradePrice", label),
        quantity: requiredNumber(row, "quantity", label),
        rawDateTime: requiredText(row, "dateTime", label),
        taxes: optionalNumber(row, "taxes", label),
        ticker: requiredText(row, "symbol", label),
      };
    })
    .sort((left, right) => left.orderId.localeCompare(right.orderId));

  return { orders };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runCli() {
  const reportPath = argumentValue("--report");
  const executionsPath = argumentValue("--executions");
  if (!reportPath || !executionsPath) {
    throw new Error(
      "Usage: node scripts/derive-ibkr-order-migration.mjs --report <Flex.xml> --executions <JSON>",
    );
  }
  const executionInput = JSON.parse(fs.readFileSync(executionsPath, "utf8"));
  if (!Array.isArray(executionInput)) {
    throw new Error("Execution JSON must be an array");
  }
  const executionIds = executionInput.map((entry) =>
    typeof entry === "string" ? entry : entry?.executionId,
  );
  const result = deriveIbkrOrderMigration(
    fs.readFileSync(reportPath, "utf8"),
    executionIds,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
