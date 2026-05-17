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

function requireString(body: JsonObject, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${key} is required`);
  }
  return value;
}

function optionalString(body: JsonObject, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${key} must be a string`);
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

function requireTrades(body: JsonObject): HttpTrade[] {
  return requireArray(body, "trades") as unknown as HttpTrade[];
}

function requirePositionSnapshots(body: JsonObject): HttpPositionSnapshot[] {
  return requireArray(
    body,
    "positionSnapshots",
  ) as unknown as HttpPositionSnapshot[];
}

function requireCashSnapshots(body: JsonObject): HttpCashSnapshot[] {
  return requireArray(body, "cashSnapshots") as unknown as HttpCashSnapshot[];
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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
          reportType: requireString(body, "reportType") as
            | "activity"
            | "trade_confirmation",
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
      const syncRunId = requireString(
        body,
        "syncRunId",
      ) as Id<"brokerageSyncRuns">;
      const rawXml = requireString(body, "rawXml");
      const contentHash = await sha256Hex(rawXml);
      const byteLength = new TextEncoder().encode(rawXml).byteLength;
      const storageId = await ctx.storage.store(
        new Blob([rawXml], { type: "application/xml" }),
      );
      try {
        const rawReportId = await ctx.runMutation(
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
            cashSnapshots: requireCashSnapshots(body),
            errors: optionalStringArray(body, "errors"),
            positionSnapshots: requirePositionSnapshots(body),
            syncRunId,
            trades: requireTrades(body),
            warnings: optionalStringArray(body, "warnings"),
          },
        );
        return jsonResponse({ rawReportId, ...result });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
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
        failureType: requireString(body, "failureType") as
          | "retryable"
          | "terminal",
        syncRunId: requireString(body, "syncRunId") as Id<"brokerageSyncRuns">,
      });
      return jsonResponse({ ok: true });
    });
  }),
});

export default http;
