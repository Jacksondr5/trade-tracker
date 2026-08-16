import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

type JsonObject = Record<string, unknown>;

class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

class JsonValidationError extends HttpRequestError {
  constructor(message: string) {
    super(message, 400);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

export function isCounterpartRequestAuthorized(req: Request): boolean {
  const expectedToken = process.env.COUNTERPART_TOKEN;
  if (!expectedToken) return false;
  return req.headers.get("authorization") === `Bearer ${expectedToken}`;
}

export function isCounterpartOwnerAuthorized(ownerId: string): boolean {
  const configuredOwnerId = process.env.COUNTERPART_OWNER_ID?.trim();
  return Boolean(configuredOwnerId && ownerId === configuredOwnerId);
}

function requireCounterpartOwner(ownerId: string): void {
  if (!isCounterpartOwnerAuthorized(ownerId)) {
    throw new HttpRequestError("Forbidden", 403);
  }
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
    throw new JsonValidationError(`${label} must be a string`);
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

export function validateDailyContextBody(body: JsonObject): {
  ownerId: string;
} {
  return { ownerId: requireString(body, "ownerId") };
}

export function validateAddNoteBody(body: JsonObject): {
  content: string;
  noteDate?: number;
  ownerId: string;
  ticker?: string;
} {
  return {
    content: requireString(body, "content"),
    noteDate: optionalNumber(body, "noteDate"),
    ownerId: requireString(body, "ownerId"),
    ticker: optionalString(body, "ticker"),
  };
}

export function validateLogCheckInBody(body: JsonObject): {
  kind: "mirror" | "briefing" | "backfill";
  noteIds?: Id<"notes">[];
  ownerId: string;
  respondedAt?: number;
  surfacedTradeIds?: string[];
  window: "late_morning" | "afternoon" | "end_of_day";
} {
  return {
    kind: requireLiteral(body, "kind", ["mirror", "briefing", "backfill"]),
    noteIds: optionalStringArray(body, "noteIds") as Id<"notes">[] | undefined,
    ownerId: requireString(body, "ownerId"),
    respondedAt: optionalNumber(body, "respondedAt"),
    surfacedTradeIds: optionalStringArray(body, "surfacedTradeIds"),
    window: requireLiteral(body, "window", [
      "late_morning",
      "afternoon",
      "end_of_day",
    ]),
  };
}

async function authorizedJson(
  req: Request,
  handler: (body: JsonObject) => Promise<Response>,
): Promise<Response> {
  if (!isCounterpartRequestAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  try {
    return await handler(await readJson(req));
  } catch (error) {
    if (!(error instanceof HttpRequestError)) throw error;
    return jsonResponse({ error: error.message }, error.status);
  }
}

const http = httpRouter();

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const args = validateDailyContextBody(body);
      requireCounterpartOwner(args.ownerId);
      const result = await ctx.runQuery(
        internal.counterpart.getDailyContext,
        args,
      );
      return jsonResponse(result);
    });
  }),
  method: "POST",
  path: "/internal/counterpart/daily-context",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const args = validateAddNoteBody(body);
      requireCounterpartOwner(args.ownerId);
      const noteId = await ctx.runMutation(internal.counterpart.addNote, args);
      return jsonResponse({ noteId });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/add-note",
});

http.route({
  handler: httpAction(async (ctx, req) => {
    return await authorizedJson(req, async (body) => {
      const args = validateLogCheckInBody(body);
      requireCounterpartOwner(args.ownerId);
      if (
        args.noteIds &&
        !(await ctx.runQuery(internal.counterpart.areNoteIdsValid, {
          noteIds: args.noteIds,
        }))
      ) {
        throw new JsonValidationError("noteIds must contain valid note IDs");
      }
      const checkInId = await ctx.runMutation(
        internal.counterpart.logCheckIn,
        args,
      );
      return jsonResponse({ checkInId });
    });
  }),
  method: "POST",
  path: "/internal/counterpart/log-check-in",
});

export default http;
