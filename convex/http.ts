import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type JsonObject = Record<string, unknown>;
class JsonValidationError extends Error {}
type HttpTrade = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  date: number;
  direction?: "long" | "short";
  executionId?: string;
  externalId: string;
  fees?: number;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  taxes?: number;
  ticker: string;
};
type HttpPositionSnapshot = {
  assetType: "stock";
  brokerageAccountId: string;
  currency?: string;
  marketValue?: number;
  quantity: number;
  reportDate: string;
  ticker: string;
};
type HttpCashSnapshot = {
  brokerageAccountId: string;
  cash: number;
  currency: string;
  reportDate: string;
};
type BrokerageIngestFlexReportBody = {
  cashSnapshots: HttpCashSnapshot[];
  errors?: string[];
  positionSnapshots: HttpPositionSnapshot[];
  rawXml: string;
  syncRunId: Id<"brokerageSyncRuns">;
  trades: HttpTrade[];
  warnings?: string[];
};
type HttpMarketDataResult = {
  close?: number;
  date: string;
  errorMessage?: string;
  provider: "twelve_data";
  providerSymbol: string;
  status: "error" | "missing" | "ok";
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

export function isBrokerageIngestionRequestAuthorized(req: Request): boolean {
  const expectedToken = process.env.BROKERAGE_INGESTION_TOKEN;
  if (!expectedToken) return false;
  return req.headers.get("authorization") === `Bearer ${expectedToken}`;
}

async function readJson(req: Request): Promise<JsonObject> {
  let body: unknown;
  try {
    body = (await req.json()) as unknown;
  } catch {
    throw new JsonValidationError("Malformed JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new JsonValidationError("Expected JSON object body");
  }
  return body as JsonObject;
}

function requireString(body: JsonObject, key: string, label = key): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${label} is required`);
  }
  return value;
}

function requireLiteral<T extends string>(
  body: JsonObject,
  key: string,
  allowed: readonly T[],
  label = key,
): T {
  const value = requireString(body, key, label);
  if (!allowed.includes(value as T)) {
    throw new JsonValidationError(
      `${label} must be one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

function optionalString(
  body: JsonObject,
  key: string,
  label = key,
): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${label} must be a string`);
  }
  return value;
}

function optionalBoolean(
  body: JsonObject,
  key: string,
  label = key,
): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new JsonValidationError(`${label} must be a boolean`);
  }
  return value;
}

function requireArray(body: JsonObject, key: string): JsonObject[] {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new JsonValidationError(`${key} must be an array`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new JsonValidationError(`${key}[${index}] must be an object`);
    }
    return item as JsonObject;
  });
}

function requireNumber(body: JsonObject, key: string, label = key): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JsonValidationError(`${label} must be a number`);
  }
  return value;
}

function optionalNumber(
  body: JsonObject,
  key: string,
  label = key,
): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JsonValidationError(`${label} must be a number`);
  }
  return value;
}

function optionalLiteral<T extends string>(
  body: JsonObject,
  key: string,
  allowed: readonly T[],
  label = key,
): T | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new JsonValidationError(
      `${label} must be one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

function requireTrades(body: JsonObject): HttpTrade[] {
  return requireArray(body, "trades").map((trade, index) => {
    const base = `trades[${index}]`;
    return {
      assetType: requireLiteral(
        trade,
        "assetType",
        ["stock"],
        `${base}.assetType`,
      ),
      brokerageAccountId: requireString(
        trade,
        "brokerageAccountId",
        `${base}.brokerageAccountId`,
      ),
      currency: optionalString(trade, "currency", `${base}.currency`),
      date: requireNumber(trade, "date", `${base}.date`),
      direction: optionalLiteral(
        trade,
        "direction",
        ["long", "short"],
        `${base}.direction`,
      ),
      executionId: optionalString(trade, "executionId", `${base}.executionId`),
      externalId: requireString(trade, "externalId", `${base}.externalId`),
      fees: optionalNumber(trade, "fees", `${base}.fees`),
      orderType: optionalString(trade, "orderType", `${base}.orderType`),
      price: requireNumber(trade, "price", `${base}.price`),
      quantity: requireNumber(trade, "quantity", `${base}.quantity`),
      side: requireLiteral(trade, "side", ["buy", "sell"], `${base}.side`),
      taxes: optionalNumber(trade, "taxes", `${base}.taxes`),
      ticker: requireString(trade, "ticker", `${base}.ticker`),
    };
  });
}

function requirePositionSnapshots(body: JsonObject): HttpPositionSnapshot[] {
  return requireArray(body, "positionSnapshots").map((snapshot, index) => {
    const base = `positionSnapshots[${index}]`;
    return {
      assetType: requireLiteral(
        snapshot,
        "assetType",
        ["stock"],
        `${base}.assetType`,
      ),
      brokerageAccountId: requireString(
        snapshot,
        "brokerageAccountId",
        `${base}.brokerageAccountId`,
      ),
      currency: optionalString(snapshot, "currency", `${base}.currency`),
      marketValue: optionalNumber(
        snapshot,
        "marketValue",
        `${base}.marketValue`,
      ),
      quantity: requireNumber(snapshot, "quantity", `${base}.quantity`),
      reportDate: requireString(snapshot, "reportDate", `${base}.reportDate`),
      ticker: requireString(snapshot, "ticker", `${base}.ticker`),
    };
  });
}

function requireCashSnapshots(body: JsonObject): HttpCashSnapshot[] {
  return requireArray(body, "cashSnapshots").map((snapshot, index) => {
    const base = `cashSnapshots[${index}]`;
    return {
      brokerageAccountId: requireString(
        snapshot,
        "brokerageAccountId",
        `${base}.brokerageAccountId`,
      ),
      cash: requireNumber(snapshot, "cash", `${base}.cash`),
      currency: requireString(snapshot, "currency", `${base}.currency`),
      reportDate: requireString(snapshot, "reportDate", `${base}.reportDate`),
    };
  });
}

function optionalStringArray(
  body: JsonObject,
  key: string,
): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new JsonValidationError(`${key} must be an array of strings`);
  }
  return value;
}

function requireMarketDataResults(body: JsonObject): HttpMarketDataResult[] {
  return requireArray(body, "results").map((result, index) => {
    const base = `results[${index}]`;
    const status = requireLiteral(
      result,
      "status",
      ["ok", "missing", "error"],
      `${base}.status`,
    );
    return {
      close: optionalNumber(result, "close", `${base}.close`),
      date: requireString(result, "date", `${base}.date`),
      errorMessage: optionalString(
        result,
        "errorMessage",
        `${base}.errorMessage`,
      ),
      provider: requireLiteral(
        result,
        "provider",
        ["twelve_data"],
        `${base}.provider`,
      ),
      providerSymbol: requireString(
        result,
        "providerSymbol",
        `${base}.providerSymbol`,
      ),
      status,
      ...(status === "ok"
        ? { close: requireNumber(result, "close", `${base}.close`) }
        : {
            errorMessage: requireString(
              result,
              "errorMessage",
              `${base}.errorMessage`,
            ),
          }),
    };
  });
}

function requirePipelineAggregate(body: JsonObject) {
  const aggregate = body.aggregate;
  if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) {
    throw new JsonValidationError("aggregate must be an object");
  }
  const aggregateBody = aggregate as JsonObject;
  const requireNonNegativeInteger = (key: string): number => {
    const value = requireNumber(aggregateBody, key);
    if (!Number.isInteger(value) || value < 0) {
      throw new JsonValidationError(`${key} must be a non-negative integer`);
    }
    return value;
  };
  return {
    datesFailed: requireNonNegativeInteger("datesFailed"),
    datesPartial: requireNonNegativeInteger("datesPartial"),
    datesSkipped: requireNonNegativeInteger("datesSkipped"),
    datesSucceeded: requireNonNegativeInteger("datesSucceeded"),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validateBrokerageIngestFlexReportBody(
  body: JsonObject,
): BrokerageIngestFlexReportBody {
  return {
    cashSnapshots: requireCashSnapshots(body),
    errors: optionalStringArray(body, "errors"),
    positionSnapshots: requirePositionSnapshots(body),
    rawXml: requireString(body, "rawXml"),
    syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
    trades: requireTrades(body),
    warnings: optionalStringArray(body, "warnings"),
  };
}

async function authorizedJson(
  req: Request,
  handler: (body: JsonObject) => Promise<Response>,
): Promise<Response> {
  if (!isBrokerageIngestionRequestAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  try {
    const body = await readJson(req);
    return await handler(body);
  } catch (error) {
    if (!(error instanceof JsonValidationError)) throw error;
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
}

async function authorizedOnly(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!isBrokerageIngestionRequestAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return await handler();
}

const http = httpRouter();

http.route({
  path: "/internal/brokerage-ingestion/due-connections",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedOnly(req, async () => {
      const connections = await ctx.runQuery(
        internal.brokerageIngestion.listDueConnections,
        {},
      );
      return jsonResponse({ connections });
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/begin-sync-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.brokerageIngestion.beginSyncRunForConnection,
        {
          connectionId: requireString(
            body,
            "connectionId",
          ) as Id<"brokerageConnections">,
          queryId: optionalString(body, "queryId"),
          reportDate: requireString(body, "reportDate"),
          reportType: requireLiteral(body, "reportType", [
            "activity",
            "trade_confirmation",
          ]),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/mark-requested",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      await ctx.runMutation(internal.brokerageIngestion.markSyncRunRequested, {
        referenceCode: requireString(body, "referenceCode"),
        syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
      });
      return jsonResponse({ ok: true });
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/mark-waiting",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      await ctx.runMutation(internal.brokerageIngestion.markSyncRunWaiting, {
        syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
      });
      return jsonResponse({ ok: true });
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/ingest-flex-report",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const {
        cashSnapshots,
        errors,
        positionSnapshots,
        rawXml,
        syncRunId,
        trades,
        warnings,
      } = validateBrokerageIngestFlexReportBody(body);
      const contentHash = await sha256Hex(rawXml);
      const byteLength = new TextEncoder().encode(rawXml).byteLength;
      let storageId: Id<"_storage"> | undefined;
      let rawReportId: Id<"brokerageRawReports"> | undefined;
      try {
        storageId = await ctx.storage.store(
          new Blob([rawXml], { type: "application/xml" }),
        );
        rawReportId = await ctx.runMutation(
          internal.brokerageIngestion.storeRawReportReference,
          {
            byteLength,
            contentHash,
            storageId,
            syncRunId,
          },
        );
        const result = await ctx.runMutation(
          internal.brokerageIngestion.ingestParsedFlexReport,
          {
            cashSnapshots,
            errors,
            positionSnapshots,
            syncRunId,
            trades,
            warnings,
          },
        );
        return jsonResponse({ rawReportId, ...result });
      } catch (error) {
        const originalError = error;
        if (storageId && rawReportId) {
          try {
            await ctx.runMutation(
              internal.brokerageIngestion.rollbackRawReportReference,
              {
                rawReportId,
                storageId,
                syncRunId,
              },
            );
          } catch {}
        }
        if (storageId) {
          try {
            await ctx.storage.delete(storageId);
          } catch {}
        }
        throw originalError;
      }
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/mark-succeeded",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      await ctx.runMutation(internal.brokerageIngestion.markSyncRunSucceeded, {
        syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
      });
      return jsonResponse({ ok: true });
    });
  }),
});

http.route({
  path: "/internal/brokerage-ingestion/mark-failed",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      await ctx.runMutation(internal.brokerageIngestion.markSyncRunFailed, {
        errorMessage: requireString(body, "errorMessage"),
        failureType: requireLiteral(body, "failureType", [
          "retryable",
          "terminal",
        ]),
        syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
      });
      return jsonResponse({ ok: true });
    });
  }),
});

http.route({
  path: "/internal/market-data/prepare-refresh",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.marketData.prepareTemporalMarketDataRefresh,
        {
          date: requireString(body, "date"),
          force: optionalBoolean(body, "force") ?? false,
          ownerId: requireString(body, "ownerId"),
          pipelineDateRunId: optionalString(body, "pipelineDateRunId"),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/market-data/plan-jobs",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runAction(
        internal.marketData.planTemporalMarketDataJobs,
        {
          date: requireString(body, "date"),
          marketDataRunId: requireString(
            body,
            "marketDataRunId",
          ) as Id<"marketDataRefreshRuns">,
          ownerId: requireString(body, "ownerId"),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/market-data/write-results",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.marketData.writeTemporalMarketDataResults,
        {
          date: requireString(body, "date"),
          marketDataRunId: requireString(
            body,
            "marketDataRunId",
          ) as Id<"marketDataRefreshRuns">,
          ownerId: requireString(body, "ownerId"),
          results: requireMarketDataResults(body),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/market-data/complete-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.marketData.completeTemporalMarketDataRun,
        {
          ownerId: requireString(body, "ownerId"),
          runId: requireString(
            body,
            "marketDataRunId",
          ) as Id<"marketDataRefreshRuns">,
          symbolsFailed: requireNumber(body, "symbolsFailed"),
          symbolsSucceeded: requireNumber(body, "symbolsSucceeded"),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/daily-owners",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedOnly(req, async () => {
      const owners = await ctx.runQuery(
        internal.portfolioPipeline.listDailyOwners,
        {},
      );
      return jsonResponse({ owners });
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/start-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.portfolioPipeline.startRun,
        {
          endDate: requireString(body, "endDate"),
          mode: requireLiteral(body, "mode", [
            "daily",
            "backfill",
            "recompute",
          ]),
          ownerId: requireString(body, "ownerId"),
          requestedByOwnerId: optionalString(body, "requestedByOwnerId"),
          startDate: requireString(body, "startDate"),
          temporalWorkflowId: requireString(body, "temporalWorkflowId"),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/complete-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.portfolioPipeline.completeRun,
        {
          aggregate: requirePipelineAggregate(body),
          pipelineRunId: requireString(
            body,
            "pipelineRunId",
          ) as Id<"portfolioPipelineRuns">,
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/start-date-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.portfolioPipeline.startDateRun,
        {
          date: requireString(body, "date"),
          mode: requireLiteral(body, "mode", [
            "daily",
            "backfill",
            "recompute",
          ]),
          ownerId: requireString(body, "ownerId"),
          pipelineRunId: requireString(
            body,
            "pipelineRunId",
          ) as Id<"portfolioPipelineRuns">,
          temporalWorkflowId: requireString(body, "temporalWorkflowId"),
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/reconcile-date",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runQuery(
        internal.portfolioPipeline.summarizeReconciliation,
        {
          date: requireString(body, "date"),
          force: optionalBoolean(body, "force") ?? false,
          ownerId: requireString(body, "ownerId"),
          pipelineDateRunId: requireString(
            body,
            "pipelineDateRunId",
          ) as Id<"portfolioPipelineDateRuns">,
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/compute-valuations",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.portfolioPipeline.computeValuations,
        {
          date: requireString(body, "date"),
          force: optionalBoolean(body, "force") ?? false,
          ownerId: requireString(body, "ownerId"),
          pipelineDateRunId: requireString(
            body,
            "pipelineDateRunId",
          ) as Id<"portfolioPipelineDateRuns">,
        },
      );
      return jsonResponse(result);
    });
  }),
});

http.route({
  path: "/internal/portfolio-pipeline/finalize-date-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const result = await ctx.runMutation(
        internal.portfolioPipeline.finalizeDateRun,
        {
          brokerageStatus: requireLiteral(body, "brokerageStatus", [
            "not_requested",
            "skipped",
            "succeeded",
            "partial",
            "failed",
            "blocked",
          ]),
          errorMessage: optionalString(body, "errorMessage"),
          marketDataStatus: requireLiteral(body, "marketDataStatus", [
            "not_requested",
            "skipped",
            "succeeded",
            "partial",
            "failed",
            "blocked",
          ]),
          pipelineDateRunId: requireString(
            body,
            "pipelineDateRunId",
          ) as Id<"portfolioPipelineDateRuns">,
          reconciliationStatus: requireLiteral(body, "reconciliationStatus", [
            "not_requested",
            "skipped",
            "succeeded",
            "partial",
            "failed",
            "blocked",
          ]),
          valuationStatus: requireLiteral(body, "valuationStatus", [
            "not_requested",
            "skipped",
            "succeeded",
            "partial",
            "failed",
            "blocked",
          ]),
        },
      );
      return jsonResponse(result);
    });
  }),
});

export default http;
