import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { acceptCounterpartTradeViaAction } from "./imports";

type JsonObject = Record<string, unknown>;
type CounterpartErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

class HttpRequestError extends Error {
  constructor(
    readonly code: CounterpartErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

class JsonValidationError extends HttpRequestError {
  constructor(message: string) {
    super("VALIDATION", message, 400, false);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function successResponse(data: unknown): Response {
  return jsonResponse({ data, ok: true });
}

function errorResponse(error: HttpRequestError): Response {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      },
      ok: false,
    },
    error.status,
  );
}

export function isCounterpartRequestAuthorized(req: Request): boolean {
  const expectedToken = process.env.COUNTERPART_TOKEN;
  if (!expectedToken) return false;
  return req.headers.get("authorization") === `Bearer ${expectedToken}`;
}

export function getConfiguredCounterpartOwner(): string | null {
  return process.env.COUNTERPART_OWNER_ID?.trim() || null;
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

function assertExactKeys(body: JsonObject, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(body).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new JsonValidationError(`Unknown field: ${unknownKey}`);
  }
}

function requireString(body: JsonObject, key: string, label = key): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${label} is required`);
  }
  return value.trim();
}

function optionalString(
  body: JsonObject,
  key: string,
  label = key,
): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalCursor(body: JsonObject): string | null {
  const value = body.cursor;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new JsonValidationError("cursor must be a string or null");
  }
  return value;
}

function requireNumber(body: JsonObject, key: string, label = key): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JsonValidationError(`${label} must be a number`);
  }
  return value;
}

function optionalInteger(
  body: JsonObject,
  key: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  const value = body[key];
  if (value === undefined) return defaultValue;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new JsonValidationError(
      `${key} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function optionalBoolean(body: JsonObject, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new JsonValidationError(`${key} must be a boolean`);
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

function optionalLiteral<T extends string>(
  body: JsonObject,
  key: string,
  allowed: readonly T[],
): T | undefined {
  if (body[key] === undefined) return undefined;
  return requireLiteral(body, key, allowed);
}

function optionalStringArray(
  body: JsonObject,
  key: string,
): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    throw new JsonValidationError(
      `${key} must be an array of non-empty strings`,
    );
  }
  return value.map((item) => item.trim());
}

function requireEasternDate(body: JsonObject, key: string): string {
  const value = requireString(body, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new JsonValidationError(`${key} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new JsonValidationError(`${key} must be a valid calendar date`);
  }
  return value;
}

function optionalEasternDate(
  body: JsonObject,
  key: string,
): string | undefined {
  if (body[key] === undefined) return undefined;
  return requireEasternDate(body, key);
}

function validateDateRange(startDate?: string, endDate?: string) {
  if (startDate && endDate && startDate > endDate) {
    throw new JsonValidationError("startDate must be on or before endDate");
  }
}

function validateNoteFilters(body: JsonObject) {
  const ticker = optionalString(body, "ticker")?.toUpperCase();
  const generalOnly = optionalBoolean(body, "generalOnly");
  const origin = optionalLiteral(body, "origin", ["retrospective"] as const);
  const startDate = optionalEasternDate(body, "startDate");
  const endDate = optionalEasternDate(body, "endDate");
  validateDateRange(startDate, endDate);
  if (ticker && generalOnly === true) {
    throw new JsonValidationError(
      "ticker and generalOnly: true are mutually exclusive",
    );
  }
  return { endDate, generalOnly, origin, startDate, ticker };
}

export function validateInstrumentContextBody(body: JsonObject) {
  assertExactKeys(body, ["ticker", "notesLimit"]);
  return {
    notesLimit: optionalInteger(body, "notesLimit", 1, 100, 25),
    ticker: requireString(body, "ticker").toUpperCase(),
  };
}

export function validateListNotesBody(body: JsonObject) {
  assertExactKeys(body, [
    "ticker",
    "generalOnly",
    "origin",
    "startDate",
    "endDate",
    "cursor",
    "limit",
  ]);
  const filters = validateNoteFilters(body);
  return {
    ...filters,
    paginationOpts: {
      cursor: optionalCursor(body),
      numItems: optionalInteger(body, "limit", 1, 100, 25),
    },
  };
}

export function validateListFillsBody(body: JsonObject) {
  assertExactKeys(body, ["ticker", "startDate", "endDate", "cursor", "limit"]);
  const ticker = optionalString(body, "ticker")?.toUpperCase();
  const startDate = optionalEasternDate(body, "startDate");
  const endDate = optionalEasternDate(body, "endDate");
  validateDateRange(startDate, endDate);
  return {
    endDate,
    paginationOpts: {
      cursor: optionalCursor(body),
      numItems: optionalInteger(body, "limit", 1, 100, 25),
    },
    startDate,
    ticker,
  };
}

export function validateEmptyBody(body: JsonObject) {
  assertExactKeys(body, []);
  return {};
}

export function validateAddNoteBody(body: JsonObject) {
  assertExactKeys(body, ["content", "noteDate", "ticker"]);
  return {
    content: requireString(body, "content"),
    noteDate: requireNumber(body, "noteDate"),
    ticker: optionalString(body, "ticker")?.toUpperCase(),
  };
}

export function validateCreateCheckInBody(body: JsonObject) {
  assertExactKeys(body, ["date", "window", "kind", "surfacedTradeIds"]);
  return {
    date: requireEasternDate(body, "date"),
    kind: requireLiteral(body, "kind", [
      "mirror",
      "briefing",
      "backfill",
    ] as const),
    surfacedTradeIds: optionalStringArray(body, "surfacedTradeIds"),
    window: requireLiteral(body, "window", [
      "late_morning",
      "afternoon",
      "end_of_day",
    ] as const),
  };
}

export function validateGetCheckInBody(body: JsonObject) {
  assertExactKeys(body, ["checkInId"]);
  return { checkInId: requireString(body, "checkInId") };
}

export function validateConfirmCheckInDeliveryBody(body: JsonObject) {
  assertExactKeys(body, ["checkInId", "deliveredAt"]);
  return {
    checkInId: requireString(body, "checkInId"),
    deliveredAt: requireNumber(body, "deliveredAt"),
  };
}

export function validateRecordCheckInResponseBody(body: JsonObject) {
  assertExactKeys(body, ["checkInId", "respondedAt", "noteIds"]);
  return {
    checkInId: requireString(body, "checkInId"),
    noteIds: optionalStringArray(body, "noteIds"),
    respondedAt: requireNumber(body, "respondedAt"),
  };
}

export function validateAcceptTradeBody(body: JsonObject) {
  assertExactKeys(body, ["ownerId", "inboxTradeId", "portfolioId"]);
  return {
    inboxTradeId: requireString(body, "inboxTradeId"),
    ownerId: requireString(body, "ownerId"),
    portfolioId: optionalString(body, "portfolioId"),
  };
}

async function authorizedJson(
  req: Request,
  handler: (body: JsonObject, ownerId: string) => Promise<Response>,
): Promise<Response> {
  if (!isCounterpartRequestAuthorized(req)) {
    return errorResponse(
      new HttpRequestError("UNAUTHORIZED", "Unauthorized", 401, false),
    );
  }
  const ownerId = getConfiguredCounterpartOwner();
  if (!ownerId) {
    return errorResponse(
      new HttpRequestError("UNAUTHORIZED", "Unauthorized", 401, false),
    );
  }
  try {
    return await handler(await readJson(req), ownerId);
  } catch (error) {
    if (error instanceof HttpRequestError) return errorResponse(error);
    console.error("counterpart_http_internal_error", error);
    return errorResponse(
      new HttpRequestError("INTERNAL", "Internal server error", 500, true),
    );
  }
}

const http = httpRouter();

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, configuredOwnerId) => {
      const args = validateAcceptTradeBody(body);
      if (args.ownerId !== configuredOwnerId) {
        throw new HttpRequestError(
          "FORBIDDEN",
          "ownerId does not match the configured counterpart owner",
          403,
          false,
        );
      }
      const data = await acceptCounterpartTradeViaAction(
        ctx,
        configuredOwnerId,
        args,
      );
      if (data.kind === "error") {
        const status =
          data.code === "NOT_FOUND"
            ? 404
            : data.code === "CONFLICT"
              ? 409
              : 400;
        throw new HttpRequestError(
          data.code,
          data.error,
          status,
          data.code === "CONFLICT",
        );
      }
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/accept-trade",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      validateEmptyBody(body);
      const data = await ctx.runQuery(internal.counterpart.getDailyContext, {
        now: Date.now(),
        ownerId,
      });
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/daily-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateInstrumentContextBody(body);
      const data = await ctx.runQuery(
        internal.counterpart.getInstrumentContext,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/instrument-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateListNotesBody(body);
      const data = await ctx.runQuery(internal.counterpart.listNotes, {
        ...args,
        ownerId,
      });
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/list-notes",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateListFillsBody(body);
      const data = await ctx.runQuery(internal.counterpart.listFills, {
        ...args,
        ownerId,
      });
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/list-fills",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      validateEmptyBody(body);
      const data = await ctx.runQuery(internal.counterpart.getStrategyContext, {
        ownerId,
      });
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/strategy-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      validateEmptyBody(body);
      const data = await ctx.runQuery(
        internal.counterpart.getPortfolioContext,
        { now: Date.now(), ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/portfolio-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateGetCheckInBody(body);
      const checkIn = await ctx.runQuery(internal.counterpart.getCheckIn, {
        ...args,
        ownerId,
      });
      if (!checkIn) {
        throw new HttpRequestError(
          "NOT_FOUND",
          "Check-in not found",
          404,
          false,
        );
      }
      return successResponse({ checkIn });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/get-check-in",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateAddNoteBody(body);
      const noteId = await ctx.runMutation(internal.counterpart.addNote, {
        ...args,
        ownerId,
      });
      return successResponse({ noteId });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/add-note",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateCreateCheckInBody(body);
      const data = await ctx.runMutation(internal.counterpart.createCheckIn, {
        ...args,
        ownerId,
      });
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/create-check-in",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateConfirmCheckInDeliveryBody(body);
      const result = await ctx.runMutation(
        internal.counterpart.confirmCheckInDelivery,
        { ...args, ownerId },
      );
      if (result === "not_found") {
        throw new HttpRequestError(
          "NOT_FOUND",
          "Check-in not found",
          404,
          false,
        );
      }
      return successResponse({ confirmed: true });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/confirm-check-in-delivery",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateRecordCheckInResponseBody(body);
      const result = await ctx.runMutation(
        internal.counterpart.recordCheckInResponse,
        { ...args, ownerId },
      );
      if (result === "not_found") {
        throw new HttpRequestError(
          "NOT_FOUND",
          "Check-in not found",
          404,
          false,
        );
      }
      if (result === "invalid_note_ids") {
        throw new JsonValidationError("noteIds must contain valid note IDs");
      }
      return successResponse({ recorded: true });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/record-check-in-response",
});

export default http;
