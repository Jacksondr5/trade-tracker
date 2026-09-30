import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { acceptCounterpartTradeViaAction } from "./imports";
import { PLAN_SECTION_KEYS } from "./lib/planModel";
import { isPlanModelError } from "./lib/planWrites";

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
    readonly details?: Record<string, unknown>,
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
        ...(error.details === undefined ? {} : { details: error.details }),
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
  assertExactKeys(body, ["content", "noteDate", "ticker", "episodeId", "campaignId"]);
  const episodeId = optionalString(body, "episodeId");
  const campaignId = optionalString(body, "campaignId");
  if (episodeId && campaignId) {
    throw new JsonValidationError("A note attaches to an episode or a campaign, not both");
  }
  return {
    campaignId,
    content: requireString(body, "content"),
    episodeId,
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
  assertExactKeys(body, ["inboxTradeId", "portfolioId"]);
  return {
    inboxTradeId: requireString(body, "inboxTradeId"),
    portfolioId: optionalString(body, "portfolioId"),
  };
}

export function validateFillDiscussionContextBody(body: JsonObject) {
  assertExactKeys(body, ["inboxTradeId"]);
  return { inboxTradeId: requireString(body, "inboxTradeId") };
}

// --- Phase 3 planning surface -------------------------------------------

const WRITE_ACTORS = ["user", "counterpart", "agent", "system"] as const;
const WRITE_SOURCES = ["conversation", "app", "migration"] as const;
const ELEMENT_AUTHORS = ["user", "counterpart"] as const;
const ELEMENT_WRITE_STATUSES = ["proposed", "agreed"] as const;
const VALUE_UNITS = ["usd", "shares", "percent", "ratio"] as const;
const VALUE_SCOPES = ["per_share", "position", "portfolio"] as const;
const VALUE_PROVENANCES = [
  "hypothetical",
  "user_reported",
  "broker_verified",
] as const;
const STOP_KINDS = ["planned_exit", "broker_order"] as const;
const MAX_ELEMENTS_PER_WRITE = 50;

function optionalOperationId(body: JsonObject): string | undefined {
  const value = optionalString(body, "operationId");
  if (value !== undefined && value.length > 200) {
    throw new JsonValidationError("operationId must be at most 200 characters");
  }
  return value;
}

function requireActor(body: JsonObject) {
  return requireLiteral(body, "actor", WRITE_ACTORS);
}

function optionalSource(body: JsonObject) {
  return optionalLiteral(body, "source", WRITE_SOURCES) ?? "conversation";
}

function optionalElementValue(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonValidationError(`${label} must be an object`);
  }
  const object = value as JsonObject;
  assertExactKeys(object, ["amount", "unit", "scope", "provenance", "stopKind"]);
  return {
    amount: requireNumber(object, "amount", `${label}.amount`),
    provenance: requireLiteral(
      object,
      "provenance",
      VALUE_PROVENANCES,
      `${label}.provenance`,
    ),
    scope: requireLiteral(object, "scope", VALUE_SCOPES, `${label}.scope`),
    stopKind: optionalLiteral(object, "stopKind", STOP_KINDS),
    unit: requireLiteral(object, "unit", VALUE_UNITS, `${label}.unit`),
  };
}

function requireElementInput(value: unknown, index: number) {
  const label = `elements[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonValidationError(`${label} must be an object`);
  }
  const object = value as JsonObject;
  assertExactKeys(object, [
    "statement",
    "status",
    "author",
    "kind",
    "asOf",
    "noteId",
    "supersedes",
    "value",
  ]);
  return {
    asOf: optionalEasternDate(object, "asOf"),
    author: requireLiteral(object, "author", ELEMENT_AUTHORS, `${label}.author`),
    kind: optionalString(object, "kind"),
    noteId: optionalString(object, "noteId"),
    statement: requireString(object, "statement", `${label}.statement`),
    status: requireLiteral(
      object,
      "status",
      ELEMENT_WRITE_STATUSES,
      `${label}.status`,
    ),
    supersedes: optionalString(object, "supersedes"),
    value: optionalElementValue(object.value, `${label}.value`),
  };
}

function requirePlanSections(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonValidationError("sections must be an object");
  }
  const object = value as JsonObject;
  assertExactKeys(object, PLAN_SECTION_KEYS);
  const sections = {} as Record<
    (typeof PLAN_SECTION_KEYS)[number],
    Array<{
      asOf?: string;
      noteId?: string;
      elementId?: string;
      text: string;
      value?: ReturnType<typeof optionalElementValue>;
    }>
  >;
  for (const key of PLAN_SECTION_KEYS) {
    const lines = object[key] ?? [];
    if (!Array.isArray(lines)) {
      throw new JsonValidationError(`sections.${key} must be an array`);
    }
    sections[key] = lines.map((line, index) => {
      const label = `sections.${key}[${index}]`;
      if (!line || typeof line !== "object" || Array.isArray(line)) {
        throw new JsonValidationError(`${label} must be an object`);
      }
      const lineObject = line as JsonObject;
      assertExactKeys(lineObject, ["text", "elementId", "noteId", "asOf", "value"]);
      return {
        asOf: optionalEasternDate(lineObject, "asOf"),
        elementId: optionalString(lineObject, "elementId"),
        noteId: optionalString(lineObject, "noteId"),
        text: requireString(lineObject, "text", `${label}.text`),
        value: optionalElementValue(lineObject.value, `${label}.value`),
      };
    });
  }
  return sections;
}

export function validateThreadContextBody(body: JsonObject) {
  assertExactKeys(body, ["ticker"]);
  return { ticker: requireString(body, "ticker").toUpperCase() };
}

export function validateEpisodeContextBody(body: JsonObject) {
  assertExactKeys(body, ["episodeId"]);
  return { episodeId: requireString(body, "episodeId") };
}

export function validateEpisodeElementsBody(body: JsonObject) {
  assertExactKeys(body, ["episodeId", "cursor", "numItems"]);
  return {
    cursor: optionalCursor(body),
    episodeId: requireString(body, "episodeId"),
    numItems: optionalInteger(body, "numItems", 1, 200, 50),
  };
}

export function validatePlanVersionBody(body: JsonObject) {
  assertExactKeys(body, ["episodeId", "versionNumber"]);
  const versionNumber = requireNumber(body, "versionNumber");
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new JsonValidationError("versionNumber must be a positive integer");
  }
  return { episodeId: requireString(body, "episodeId"), versionNumber };
}

export function validateOpenEpisodeBody(body: JsonObject) {
  assertExactKeys(body, [
    "ticker",
    "portfolioId",
    "campaignId",
    "actor",
    "source",
    "operationId",
  ]);
  return {
    actor: requireActor(body),
    campaignId: optionalString(body, "campaignId"),
    operationId: optionalOperationId(body),
    portfolioId: optionalString(body, "portfolioId"),
    source: optionalSource(body),
    ticker: requireString(body, "ticker").toUpperCase(),
  };
}

export function validateRecordElementsBody(body: JsonObject) {
  assertExactKeys(body, [
    "episodeId",
    "campaignId",
    "elements",
    "actor",
    "source",
    "operationId",
  ]);
  const elements = body.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new JsonValidationError("elements must be a non-empty array");
  }
  if (elements.length > MAX_ELEMENTS_PER_WRITE) {
    throw new JsonValidationError(
      `elements may hold at most ${MAX_ELEMENTS_PER_WRITE} items`,
    );
  }
  const episodeId = optionalString(body, "episodeId");
  const campaignId = optionalString(body, "campaignId");
  if ((episodeId === undefined) === (campaignId === undefined)) {
    throw new JsonValidationError(
      "Exactly one of episodeId or campaignId is required",
    );
  }
  return {
    actor: requireActor(body),
    campaignId,
    elements: elements.map(requireElementInput),
    episodeId,
    operationId: optionalOperationId(body),
    source: optionalSource(body),
  };
}

export function validateSetElementStatusBody(body: JsonObject) {
  assertExactKeys(body, ["elementId", "status", "evidence", "actor", "operationId"]);
  return {
    actor: requireActor(body),
    elementId: requireString(body, "elementId"),
    evidence: optionalString(body, "evidence"),
    operationId: optionalOperationId(body),
    status: requireLiteral(body, "status", ["agreed", "dropped"] as const),
  };
}

export function validateDraftPlanVersionBody(body: JsonObject) {
  assertExactKeys(body, [
    "episodeId",
    "sections",
    "compiledThroughRevision",
    "observedRevision",
    "actor",
    "source",
    "operationId",
  ]);
  const observedRevision = requireNumber(body, "observedRevision");
  if (!Number.isInteger(observedRevision) || observedRevision < 0) {
    throw new JsonValidationError("observedRevision must be a non-negative integer");
  }
  const compiledThroughRevision = body.compiledThroughRevision;
  if (
    compiledThroughRevision !== undefined &&
    (typeof compiledThroughRevision !== "number" ||
      !Number.isInteger(compiledThroughRevision) ||
      compiledThroughRevision < 0)
  ) {
    throw new JsonValidationError(
      "compiledThroughRevision must be a non-negative integer",
    );
  }
  return {
    actor: requireActor(body),
    compiledThroughRevision: compiledThroughRevision as number | undefined,
    episodeId: requireString(body, "episodeId"),
    observedRevision,
    operationId: optionalOperationId(body),
    sections: requirePlanSections(body.sections),
    source: optionalSource(body),
  };
}

export function validateEndorsePlanVersionBody(body: JsonObject) {
  assertExactKeys(body, [
    "episodeId",
    "versionNumber",
    "agreeElementIds",
    "actor",
    "operationId",
  ]);
  const versionNumber = requireNumber(body, "versionNumber");
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new JsonValidationError("versionNumber must be a positive integer");
  }
  return {
    actor: requireActor(body),
    agreeElementIds: optionalStringArray(body, "agreeElementIds"),
    episodeId: requireString(body, "episodeId"),
    operationId: optionalOperationId(body),
    versionNumber,
  };
}

export function validateLinkTradeBody(body: JsonObject) {
  assertExactKeys(body, ["tradeId", "episodeId", "operationId"]);
  const episodeId = body.episodeId;
  if (episodeId !== null && (typeof episodeId !== "string" || !episodeId.trim())) {
    throw new JsonValidationError("episodeId must be a string or null");
  }
  return {
    episodeId: episodeId === null ? null : (episodeId as string).trim(),
    operationId: optionalOperationId(body),
    tradeId: requireString(body, "tradeId"),
  };
}

export function validateSetEpisodeCampaignBody(body: JsonObject) {
  assertExactKeys(body, [
    "episodeId",
    "campaignId",
    "exemptedCampaignElementIds",
    "operationId",
  ]);
  const campaignId = body.campaignId;
  if (campaignId !== null && (typeof campaignId !== "string" || !campaignId.trim())) {
    throw new JsonValidationError("campaignId must be a string or null");
  }
  return {
    campaignId: campaignId === null ? null : (campaignId as string).trim(),
    episodeId: requireString(body, "episodeId"),
    exemptedCampaignElementIds: optionalStringArray(
      body,
      "exemptedCampaignElementIds",
    ),
    operationId: optionalOperationId(body),
  };
}

export function validateShelveEpisodeBody(body: JsonObject) {
  assertExactKeys(body, ["episodeId", "shelved", "actor", "source", "operationId"]);
  return {
    actor: requireActor(body),
    episodeId: requireString(body, "episodeId"),
    operationId: optionalOperationId(body),
    shelved: optionalBoolean(body, "shelved") ?? true,
    source: optionalSource(body),
  };
}

export function validateUpsertCampaignBody(body: JsonObject) {
  assertExactKeys(body, [
    "campaignId",
    "name",
    "thesis",
    "benchmarkTicker",
    "linkedTickers",
    "actor",
    "operationId",
  ]);
  const benchmarkTicker = body.benchmarkTicker;
  if (
    benchmarkTicker !== undefined &&
    benchmarkTicker !== null &&
    (typeof benchmarkTicker !== "string" || !benchmarkTicker.trim())
  ) {
    throw new JsonValidationError("benchmarkTicker must be a string or null");
  }
  const campaignId = optionalString(body, "campaignId");
  const name = optionalString(body, "name");
  if (!campaignId && !name) {
    throw new JsonValidationError("name is required when creating a campaign");
  }
  return {
    actor: requireActor(body),
    benchmarkTicker:
      benchmarkTicker === undefined
        ? undefined
        : benchmarkTicker === null
          ? null
          : (benchmarkTicker as string).trim().toUpperCase(),
    campaignId,
    linkedTickers: optionalStringArray(body, "linkedTickers")?.map((ticker) =>
      ticker.toUpperCase(),
    ),
    name,
    operationId: optionalOperationId(body),
    thesis: body.thesis === undefined ? undefined : String(body.thesis),
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
    if (isPlanModelError(error)) {
      const status =
        error.data.code === "CONFLICT"
          ? 409
          : error.data.code === "NOT_FOUND"
            ? 404
            : 400;
      return errorResponse(
        new HttpRequestError(
          error.data.code,
          error.data.message,
          status,
          false,
          undefined,
          error.data.details,
        ),
      );
    }
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
      const args = validateFillDiscussionContextBody(body);
      const data = await ctx.runQuery(
        internal.counterpart.getFillDiscussionContext,
        { ...args, now: Date.now(), ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/fill-discussion-context",
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
      if (noteId === null) {
        throw new HttpRequestError(
          "NOT_FOUND",
          "Episode or campaign not found",
          404,
          false,
        );
      }
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

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateThreadContextBody(body);
      const data = await ctx.runQuery(
        internal.counterpartPlanning.getThreadContext,
        { ...args, now: Date.now(), ownerId },
      );
      if (!data) {
        throw new HttpRequestError("NOT_FOUND", "Thread not found", 404, false);
      }
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/thread-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateEpisodeContextBody(body);
      const data = await ctx.runQuery(
        internal.counterpartPlanning.getEpisodeContext,
        { ...args, now: Date.now(), ownerId },
      );
      if (!data) {
        throw new HttpRequestError("NOT_FOUND", "Episode not found", 404, false);
      }
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/episode-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      validateEmptyBody(body);
      const data = await ctx.runQuery(
        internal.counterpartPlanning.getDeskContext,
        { ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/desk-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateEpisodeElementsBody(body);
      const data = await ctx.runQuery(
        internal.counterpartPlanning.listEpisodeElementsForCounterpart,
        { ...args, ownerId },
      );
      if (!data) {
        throw new HttpRequestError("NOT_FOUND", "Episode not found", 404, false);
      }
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/episode-elements",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validatePlanVersionBody(body);
      const version = await ctx.runQuery(
        internal.counterpartPlanning.getPlanVersionForCounterpart,
        { ...args, ownerId },
      );
      if (!version) {
        throw new HttpRequestError(
          "NOT_FOUND",
          "Plan version not found",
          404,
          false,
        );
      }
      return successResponse({ version });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/plan-version",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      validateEmptyBody(body);
      const campaigns = await ctx.runQuery(
        internal.counterpartPlanning.listCampaignContexts,
        { ownerId },
      );
      return successResponse({ campaigns });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/list-campaigns",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateOpenEpisodeBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.openEpisodeForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/open-episode",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateRecordElementsBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.recordElementsForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/record-elements",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateSetElementStatusBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.setElementStatusForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/set-element-status",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateDraftPlanVersionBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.draftPlanVersionForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/draft-plan-version",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateEndorsePlanVersionBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.endorsePlanVersionForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/endorse-plan-version",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateLinkTradeBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.linkTradeForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/link-trade",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateSetEpisodeCampaignBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.setEpisodeCampaignForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/set-episode-campaign",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateShelveEpisodeBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.shelveEpisodeForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/shelve-episode",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body, ownerId) => {
      const args = validateUpsertCampaignBody(body);
      const data = await ctx.runMutation(
        internal.counterpartPlanning.upsertCampaignForCounterpart,
        { ...args, ownerId },
      );
      return successResponse(data);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/upsert-campaign",
});

export default http;
