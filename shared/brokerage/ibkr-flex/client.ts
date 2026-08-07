import { XMLParser } from "fast-xml-parser";

type UnknownRecord = Record<string, unknown>;

const DEFAULT_IBKR_FLEX_BASE_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
export const IBKR_FLEX_REQUEST_TIMEOUT_MS = 90_000;

export type IbkrFlexClientConfig = {
  baseUrl?: string;
  token: string;
};

export type IbkrStatementResult =
  | { rawXml: string; status: "ready" }
  | { message?: string; status: "not_ready" }
  | { errorCode?: string; errorMessage: string; status: "terminal_error" };

export class IbkrFlexTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IbkrFlexTerminalError";
  }
}

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  trimValues: true,
});

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function findText(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as UnknownRecord;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number") return String(raw);
  }
  for (const child of Object.values(record)) {
    const found = findText(child, keys);
    if (found) return found;
  }
  return undefined;
}

function parseXml(xml: string): UnknownRecord {
  return asRecord(parser.parse(xml)) ?? {};
}

function isReadyStatement(xml: string, root: UnknownRecord): boolean {
  return (
    Boolean(root.FlexStatement) ||
    Boolean(root.FlexQueryResponse) ||
    /<FlexStatement(?:\s|>)/.test(xml)
  );
}

function isNotReady(code: string | undefined, message: string | undefined) {
  const haystack = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  return (
    haystack.includes("not ready") ||
    haystack.includes("generation") ||
    haystack.includes("statement is being prepared") ||
    haystack.includes("1019")
  );
}

function isTerminal(code: string | undefined, message: string | undefined) {
  const haystack = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  return (
    haystack.includes("invalid token") ||
    haystack.includes("invalid query") ||
    haystack.includes("token has expired") ||
    haystack.includes("query id")
  );
}

function withCode(message: string, code: string | undefined): string {
  return code ? `${message} (${code})` : message;
}

export class IbkrFlexClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: IbkrFlexClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_IBKR_FLEX_BASE_URL).replace(
      /\/+$/,
      "",
    );
  }

  async sendRequest(args: {
    queryId: string;
  }): Promise<{ referenceCode: string }> {
    const xml = await this.getText(
      this.url("SendRequest", { q: args.queryId }),
    );
    const root = parseXml(xml);
    const referenceCode = findText(root, ["ReferenceCode", "referenceCode"]);
    if (referenceCode) return { referenceCode };

    const errorCode = findText(root, ["ErrorCode", "errorCode"]);
    const errorMessage =
      findText(root, ["ErrorMessage", "errorMessage", "Status", "status"]) ??
      "IBKR Flex SendRequest failed";
    const message = `${withCode("IBKR Flex SendRequest failed", errorCode)}: ${errorMessage}`;
    if (isTerminal(errorCode, errorMessage)) {
      throw new IbkrFlexTerminalError(message);
    }
    throw new Error(message);
  }

  async getStatement(referenceCode: string): Promise<IbkrStatementResult> {
    const xml = await this.getText(
      this.url("GetStatement", { q: referenceCode }),
    );
    const root = parseXml(xml);
    if (isReadyStatement(xml, root)) {
      return { rawXml: xml, status: "ready" };
    }

    const errorCode = findText(root, ["ErrorCode", "errorCode"]);
    const errorMessage =
      findText(root, ["ErrorMessage", "errorMessage", "Status", "status"]) ??
      "IBKR Flex statement is not ready";
    if (isNotReady(errorCode, errorMessage)) {
      return { message: errorMessage, status: "not_ready" };
    }
    if (isTerminal(errorCode, errorMessage)) {
      return { errorCode, errorMessage, status: "terminal_error" };
    }
    throw new Error(
      `${withCode("IBKR Flex GetStatement failed", errorCode)}: ${errorMessage}`,
    );
  }

  private url(endpoint: string, params: Record<string, string>): URL {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("t", this.config.token);
    url.searchParams.set("v", "3");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  private async getText(url: URL): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      IBKR_FLEX_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": "TradeTracker/0.0.1" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `IBKR Flex request failed ${response.status}: ${response.statusText}`,
        );
      }
      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `IBKR Flex request timed out after ${IBKR_FLEX_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
