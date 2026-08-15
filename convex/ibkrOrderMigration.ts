import { ConvexError, v } from "convex/values";
import {
  assertIbkrEasternTimezoneAvailable,
  parseIbkrEasternTimestamp,
} from "../shared/brokerage/ibkr-flex/time";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const MAX_ORDER_GROUPS = 100;
const MAX_EXECUTIONS = 200;

const rawOrderValidator = v.object({
  assetCategory: v.string(),
  brokerageAccountId: v.string(),
  buySell: v.string(),
  currency: v.string(),
  executionIds: v.array(v.string()),
  fees: v.optional(v.number()),
  openCloseIndicator: v.optional(v.string()),
  orderId: v.string(),
  orderType: v.optional(v.string()),
  price: v.number(),
  quantity: v.number(),
  rawDateTime: v.string(),
  taxes: v.optional(v.number()),
  ticker: v.string(),
});

const targetOrderValidator = v.object({
  brokerageAccountId: v.string(),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  fees: v.optional(v.number()),
  orderId: v.string(),
  orderType: v.optional(v.string()),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  taxes: v.optional(v.number()),
  ticker: v.string(),
});

const sourceRowValidator = v.object({
  date: v.union(v.number(), v.null()),
  executionId: v.string(),
  fees: v.union(v.number(), v.null()),
  id: v.string(),
  price: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  table: v.union(v.literal("trades"), v.literal("inboxTrades")),
});

const migrationGroupValidator = v.object({
  aggregationMatches: v.boolean(),
  executionIds: v.array(v.string()),
  metadataMatches: v.boolean(),
  orderId: v.string(),
  recordState: v.union(v.literal("accepted"), v.literal("pending_review")),
  sourceRows: v.array(sourceRowValidator),
  target: targetOrderValidator,
});

const migrationSummaryValidator = v.object({
  acceptedOrdersAfter: v.number(),
  acceptedRowsDeleted: v.number(),
  acceptedRowsMatched: v.number(),
  acceptedRowsPlannedToDelete: v.number(),
  acceptedRowsPlannedToWrite: v.number(),
  acceptedRowsWritten: v.number(),
  auditToken: v.string(),
  dryRun: v.boolean(),
  executionIdsExcludedByMaximumCreationTime: v.array(v.string()),
  groups: v.array(migrationGroupValidator),
  maximumCreationTime: v.number(),
  minimumCreationTime: v.number(),
  pendingOrdersAfter: v.number(),
  pendingRowsDeleted: v.number(),
  pendingRowsMatched: v.number(),
  pendingRowsPlannedToDelete: v.number(),
  pendingRowsPlannedToWrite: v.number(),
  pendingRowsWritten: v.number(),
  requestedExecutions: v.number(),
  requestedOrders: v.number(),
  safeToExecute: v.boolean(),
});

type RawOrder = {
  assetCategory: string;
  brokerageAccountId: string;
  buySell: string;
  currency: string;
  executionIds: string[];
  fees?: number;
  openCloseIndicator?: string;
  orderId: string;
  orderType?: string;
  price: number;
  quantity: number;
  rawDateTime: string;
  taxes?: number;
  ticker: string;
};

type TargetOrder = {
  brokerageAccountId: string;
  date: number;
  direction: "long" | "short";
  fees?: number;
  orderId: string;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  taxes?: number;
  ticker: string;
};

type ExistingRow =
  | { document: Doc<"inboxTrades">; executionId: string; table: "inboxTrades" }
  | { document: Doc<"trades">; executionId: string; table: "trades" };

type MigrationPlan = {
  aggregationMatches: boolean;
  deleteRows: ExistingRow[];
  executionIds: string[];
  keepRow: ExistingRow;
  metadataMatches: boolean;
  orderId: string;
  recordState: "accepted" | "pending_review";
  sourceRows: ExistingRow[];
  target: TargetOrder;
};

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function inferSide(value: string): "buy" | "sell" | undefined {
  const side = normalized(value);
  if (side === "BUY" || side === "BOT" || side === "B") return "buy";
  if (side === "SELL" || side === "SLD" || side === "S") return "sell";
  return undefined;
}

function inferDirection(
  openCloseIndicator: string | undefined,
  side: "buy" | "sell",
): "long" | "short" | undefined {
  const openClose = openCloseIndicator
    ? normalized(openCloseIndicator)
    : undefined;
  if ((openClose === "O" || openClose === "OPEN") && side === "buy") {
    return "long";
  }
  if ((openClose === "O" || openClose === "OPEN") && side === "sell") {
    return "short";
  }
  if ((openClose === "C" || openClose === "CLOSE") && side === "sell") {
    return "long";
  }
  if ((openClose === "C" || openClose === "CLOSE") && side === "buy") {
    return "short";
  }
  return undefined;
}

function parseTargetOrder(order: RawOrder): TargetOrder {
  if (normalized(order.assetCategory) !== "STK") {
    throw new ConvexError(
      `IBKR order migration refused: ${order.orderId} is not a stock order`,
    );
  }
  if (normalized(order.currency) !== "USD") {
    throw new ConvexError(
      `IBKR order migration refused: ${order.orderId} is not USD-denominated`,
    );
  }
  const side = inferSide(order.buySell);
  const direction = side
    ? inferDirection(order.openCloseIndicator, side)
    : undefined;
  const date = parseIbkrEasternTimestamp(order.rawDateTime);
  const orderId = order.orderId.trim();
  const brokerageAccountId = order.brokerageAccountId.trim();
  const ticker = normalized(order.ticker);
  if (!orderId || !brokerageAccountId || !ticker) {
    throw new ConvexError(
      "IBKR order migration refused: order id, account id, and ticker are required",
    );
  }
  if (!side || !direction || date === undefined) {
    throw new ConvexError(
      `IBKR order migration refused: ${order.orderId} has invalid side, direction, or dateTime`,
    );
  }
  const price = order.price;
  const quantity = Math.abs(order.quantity);
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(quantity) ||
    price <= 0 ||
    quantity <= 0
  ) {
    throw new ConvexError(
      `IBKR order migration refused: ${order.orderId} has invalid price or quantity`,
    );
  }
  return {
    brokerageAccountId,
    date,
    direction,
    fees: order.fees,
    orderId,
    orderType: order.orderType?.trim() || undefined,
    price,
    quantity,
    side,
    taxes: order.taxes,
    ticker,
  };
}

function optionalNumber(value: number | undefined): number | null {
  return value ?? null;
}

function optionalString(value: string | undefined): string | null {
  return value ?? null;
}

function nearlyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function summedOptional(
  rows: ExistingRow[],
  field: "fees" | "taxes",
): number | undefined {
  const values = rows.map(({ document }) => document[field]);
  return values.every((value) => value === undefined)
    ? undefined
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function sameOptionalIds(
  rows: ExistingRow[],
  field: "portfolioId" | "tradePlanId",
): boolean {
  return (
    new Set(rows.map(({ document }) => String(document[field] ?? ""))).size ===
    1
  );
}

function mergedPendingMessages(
  rows: ExistingRow[],
  field: "validationErrors" | "validationWarnings",
): string[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        row.table === "inboxTrades" ? row.document[field] : [],
      ),
    ),
  ].sort();
}

function buildPlan(order: RawOrder, rows: ExistingRow[]): MigrationPlan {
  const target = parseTargetOrder(order);
  const tables = new Set(rows.map((row) => row.table));
  if (tables.size !== 1) {
    throw new ConvexError(
      `IBKR order migration refused: ${order.orderId} crosses accepted and pending records`,
    );
  }
  const recordState =
    rows[0]!.table === "trades" ? "accepted" : "pending_review";
  if (recordState === "accepted" && rows.length !== 1) {
    throw new ConvexError(
      `IBKR order migration refused: accepted order ${order.orderId} contains multiple execution records`,
    );
  }
  const sortedRows = [...rows].sort((left, right) =>
    String(left.document._id).localeCompare(String(right.document._id)),
  );
  const quantity = rows.reduce(
    (sum, { document }) => sum + Math.abs(document.quantity ?? 0),
    0,
  );
  const weightedValue = rows.reduce(
    (sum, { document }) =>
      sum + Math.abs(document.quantity ?? 0) * (document.price ?? 0),
    0,
  );
  const weightedPrice = quantity === 0 ? 0 : weightedValue / quantity;
  const fees = summedOptional(rows, "fees");
  const taxes = summedOptional(rows, "taxes");
  const aggregationMatches =
    nearlyEqual(quantity, target.quantity) &&
    nearlyEqual(weightedPrice, target.price) &&
    ((fees === undefined && target.fees === undefined) ||
      (fees !== undefined &&
        target.fees !== undefined &&
        nearlyEqual(fees, target.fees))) &&
    ((taxes === undefined && target.taxes === undefined) ||
      (taxes !== undefined &&
        target.taxes !== undefined &&
        nearlyEqual(taxes, target.taxes)));
  const ownerIds = new Set(rows.map(({ document }) => document.ownerId));
  const metadataMatches =
    ownerIds.size === 1 &&
    sameOptionalIds(rows, "portfolioId") &&
    sameOptionalIds(rows, "tradePlanId") &&
    rows.every(
      ({ document }) =>
        document.brokerageAccountId === target.brokerageAccountId &&
        document.date === target.date &&
        document.direction === target.direction &&
        document.side === target.side &&
        document.ticker === target.ticker,
    );
  return {
    aggregationMatches,
    deleteRows: sortedRows.slice(1),
    executionIds: [...order.executionIds].sort(),
    keepRow: sortedRows[0]!,
    metadataMatches,
    orderId: target.orderId,
    recordState,
    sourceRows: sortedRows,
    target,
  };
}

function auditHash(
  plans: MigrationPlan[],
  bounds: { maximum: number; minimum: number },
  cutoffExclusions: string[],
): string {
  let hash = 2_166_136_261;
  const lines = [
    `bounds:${bounds.minimum}:${bounds.maximum}`,
    `cutoff-exclusions:${cutoffExclusions.join(",")}`,
    ...plans.map((plan) =>
      JSON.stringify({
        aggregationMatches: plan.aggregationMatches,
        deleteIds: plan.deleteRows.map(({ document }) => String(document._id)),
        executionIds: plan.executionIds,
        keepId: String(plan.keepRow.document._id),
        metadataMatches: plan.metadataMatches,
        orderId: plan.orderId,
        recordState: plan.recordState,
        sourceRows: plan.sourceRows.map(({ document, executionId, table }) => ({
          brokerageAccountId: optionalString(document.brokerageAccountId),
          creationTime: document._creationTime,
          date: document.date ?? null,
          direction: optionalString(document.direction),
          executionId,
          externalId: optionalString(document.externalId),
          fees: optionalNumber(document.fees),
          id: String(document._id),
          orderType: optionalString(document.orderType),
          ownerId: document.ownerId,
          portfolioId: optionalString(
            document.portfolioId ? String(document.portfolioId) : undefined,
          ),
          price: document.price ?? null,
          quantity: document.quantity ?? null,
          side: optionalString(document.side),
          table,
          taxes: optionalNumber(document.taxes),
          ticker: optionalString(document.ticker),
          tradePlanId: optionalString(
            document.tradePlanId ? String(document.tradePlanId) : undefined,
          ),
          validationErrors:
            table === "inboxTrades" ? document.validationErrors : [],
          validationWarnings:
            table === "inboxTrades" ? document.validationWarnings : [],
        })),
        target: plan.target,
      }),
    ),
  ].sort();
  const input = lines.join("|");
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `ibkr-order-v1:${plans.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function targetPatch(plan: MigrationPlan) {
  const { target } = plan;
  return {
    assetType: "stock" as const,
    brokerageAccountId: target.brokerageAccountId,
    date: target.date,
    direction: target.direction,
    externalId: target.orderId,
    fees: target.fees,
    orderType: target.orderType,
    price: target.price,
    quantity: target.quantity,
    side: target.side,
    taxes: target.taxes,
    ticker: target.ticker,
    ...(plan.recordState === "pending_review"
      ? {
          validationErrors: mergedPendingMessages(
            plan.sourceRows,
            "validationErrors",
          ),
          validationWarnings: mergedPendingMessages(
            plan.sourceRows,
            "validationWarnings",
          ),
        }
      : {}),
  };
}

/**
 * One-off, approval-gated migration from exact Flex ibExecID records to their
 * authoritative ibOrderID rows. CSV-composite history is intentionally outside
 * this function: callers must supply the exact execution-to-order groups proven
 * by the retained mapping report.
 */
export const migrateIbkrExecutionsToOrders = internalMutation({
  args: {
    dryRun: v.boolean(),
    expectedAuditToken: v.optional(v.string()),
    maximumCreationTime: v.number(),
    minimumCreationTime: v.number(),
    orders: v.array(rawOrderValidator),
  },
  returns: migrationSummaryValidator,
  handler: async (ctx, args) => {
    assertIbkrEasternTimezoneAvailable();
    if (
      !Number.isFinite(args.minimumCreationTime) ||
      !Number.isFinite(args.maximumCreationTime) ||
      args.minimumCreationTime >= args.maximumCreationTime
    ) {
      throw new ConvexError(
        "IBKR order migration refused: creation-time bounds must be finite and increasing",
      );
    }
    if (args.orders.length === 0 || args.orders.length > MAX_ORDER_GROUPS) {
      throw new ConvexError(
        `IBKR order migration refused: orders must contain 1-${MAX_ORDER_GROUPS} groups`,
      );
    }

    const orderIds = args.orders.map((order) => order.orderId.trim());
    const executionIds = args.orders.flatMap((order) => order.executionIds);
    if (
      orderIds.some(
        (orderId, index) => orderId !== args.orders[index]!.orderId,
      ) ||
      executionIds.some(
        (executionId) => !executionId || executionId !== executionId.trim(),
      ) ||
      new Set(orderIds).size !== orderIds.length ||
      executionIds.length === 0 ||
      executionIds.length > MAX_EXECUTIONS ||
      new Set(executionIds).size !== executionIds.length ||
      args.orders.some((order) => order.executionIds.length === 0)
    ) {
      throw new ConvexError(
        `IBKR order migration refused: order ids and 1-${MAX_EXECUTIONS} execution ids must be unique`,
      );
    }

    const matches = await Promise.all(
      executionIds.map(async (executionId) => {
        const [accepted, pending, acceptedAfterCutoff, pendingAfterCutoff] =
          await Promise.all([
            ctx.db
              .query("trades")
              .withIndex("by_source_externalId", (query) =>
                query
                  .eq("source", "ibkr")
                  .eq("externalId", executionId)
                  .lt("_creationTime", args.maximumCreationTime),
              )
              .take(2),
            ctx.db
              .query("inboxTrades")
              .withIndex("by_source_externalId", (query) =>
                query
                  .eq("source", "ibkr")
                  .eq("externalId", executionId)
                  .lt("_creationTime", args.maximumCreationTime),
              )
              .take(2),
            ctx.db
              .query("trades")
              .withIndex("by_source_externalId", (query) =>
                query
                  .eq("source", "ibkr")
                  .eq("externalId", executionId)
                  .gte("_creationTime", args.maximumCreationTime),
              )
              .take(1),
            ctx.db
              .query("inboxTrades")
              .withIndex("by_source_externalId", (query) =>
                query
                  .eq("source", "ibkr")
                  .eq("externalId", executionId)
                  .gte("_creationTime", args.maximumCreationTime),
              )
              .take(1),
          ]);
        const rows: ExistingRow[] = [
          ...accepted.map((document) => ({
            document,
            executionId,
            table: "trades" as const,
          })),
          ...pending.map((document) => ({
            document,
            executionId,
            table: "inboxTrades" as const,
          })),
        ];
        return {
          excluded:
            acceptedAfterCutoff.length > 0 || pendingAfterCutoff.length > 0,
          executionId,
          rows,
        };
      }),
    );
    const cutoffExclusions = matches
      .filter((match) => match.excluded)
      .map((match) => match.executionId)
      .sort();
    if (matches.some((match) => match.rows.length !== 1 || match.excluded)) {
      throw new ConvexError(
        `IBKR order migration refused: supplied executions did not match stored records one-to-one; maximumCreationTime excluded ${cutoffExclusions.length} execution ids`,
      );
    }
    const rowsByExecution = new Map(
      matches.map((match) => [match.executionId, match.rows[0]!] as const),
    );
    for (const { document, executionId } of rowsByExecution.values()) {
      if (document._creationTime < args.minimumCreationTime) {
        throw new ConvexError(
          `IBKR order migration refused: ${executionId} predates the first successful Flex sync`,
        );
      }
    }

    const targetMatches = await Promise.all(
      orderIds.map(async (orderId) => {
        const [accepted, pending] = await Promise.all([
          ctx.db
            .query("trades")
            .withIndex("by_source_externalId", (query) =>
              query.eq("source", "ibkr").eq("externalId", orderId),
            )
            .take(1),
          ctx.db
            .query("inboxTrades")
            .withIndex("by_source_externalId", (query) =>
              query.eq("source", "ibkr").eq("externalId", orderId),
            )
            .take(1),
        ]);
        return { accepted, orderId, pending };
      }),
    );
    const existingTargets = targetMatches.filter(
      (match) => match.accepted.length > 0 || match.pending.length > 0,
    );
    if (existingTargets.length > 0) {
      throw new ConvexError(
        `IBKR order migration refused: target order ids already exist: ${existingTargets.map((match) => match.orderId).join(", ")}`,
      );
    }

    const plans = args.orders
      .map((order) =>
        buildPlan(
          order,
          order.executionIds.map(
            (executionId) => rowsByExecution.get(executionId)!,
          ),
        ),
      )
      .sort((left, right) => left.orderId.localeCompare(right.orderId));
    const safeToExecute = plans.every(
      (plan) => plan.aggregationMatches && plan.metadataMatches,
    );
    const token = auditHash(
      plans,
      { maximum: args.maximumCreationTime, minimum: args.minimumCreationTime },
      cutoffExclusions,
    );
    if (!args.dryRun && !safeToExecute) {
      throw new ConvexError(
        "IBKR order migration refused: source executions do not reconcile with the supplied order rows",
      );
    }
    if (!args.dryRun && args.expectedAuditToken !== token) {
      throw new ConvexError(
        "IBKR order migration refused: expectedAuditToken does not match the current dry-run plan",
      );
    }

    if (!args.dryRun) {
      for (const plan of plans) {
        await ctx.db.patch(plan.keepRow.document._id, targetPatch(plan));
        for (const row of plan.deleteRows) {
          await ctx.db.delete(row.document._id);
        }
      }
    }

    const acceptedPlans = plans.filter(
      (plan) => plan.recordState === "accepted",
    );
    const pendingPlans = plans.filter(
      (plan) => plan.recordState === "pending_review",
    );
    const acceptedMatched = acceptedPlans.reduce(
      (sum, plan) => sum + plan.sourceRows.length,
      0,
    );
    const pendingMatched = pendingPlans.reduce(
      (sum, plan) => sum + plan.sourceRows.length,
      0,
    );
    const acceptedDeleted = acceptedPlans.reduce(
      (sum, plan) => sum + plan.deleteRows.length,
      0,
    );
    const pendingDeleted = pendingPlans.reduce(
      (sum, plan) => sum + plan.deleteRows.length,
      0,
    );
    return {
      acceptedOrdersAfter: acceptedPlans.length,
      acceptedRowsDeleted: args.dryRun ? 0 : acceptedDeleted,
      acceptedRowsMatched: acceptedMatched,
      acceptedRowsPlannedToDelete: acceptedDeleted,
      acceptedRowsPlannedToWrite: acceptedPlans.length,
      acceptedRowsWritten: args.dryRun ? 0 : acceptedPlans.length,
      auditToken: token,
      dryRun: args.dryRun,
      executionIdsExcludedByMaximumCreationTime: cutoffExclusions,
      groups: plans.map((plan) => ({
        aggregationMatches: plan.aggregationMatches,
        executionIds: plan.executionIds,
        metadataMatches: plan.metadataMatches,
        orderId: plan.orderId,
        recordState: plan.recordState,
        sourceRows: plan.sourceRows.map(({ document, executionId, table }) => ({
          date: document.date ?? null,
          executionId,
          fees: document.fees ?? null,
          id: String(document._id),
          price: document.price ?? null,
          quantity: document.quantity ?? null,
          table,
        })),
        target: plan.target,
      })),
      maximumCreationTime: args.maximumCreationTime,
      minimumCreationTime: args.minimumCreationTime,
      pendingOrdersAfter: pendingPlans.length,
      pendingRowsDeleted: args.dryRun ? 0 : pendingDeleted,
      pendingRowsMatched: pendingMatched,
      pendingRowsPlannedToDelete: pendingDeleted,
      pendingRowsPlannedToWrite: pendingPlans.length,
      pendingRowsWritten: args.dryRun ? 0 : pendingPlans.length,
      requestedExecutions: executionIds.length,
      requestedOrders: plans.length,
      safeToExecute,
    };
  },
});
