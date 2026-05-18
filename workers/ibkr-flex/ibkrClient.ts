import { XMLParser } from "fast-xml-parser";
import type { IbkrFlexWorkerConfig } from "./config";

type UnknownRecord = Record<string, unknown>;

export type IbkrStatementResult =
  | { rawXml: string; status: "ready" }
  | { message?: string; status: "not_ready" }
  | { errorCode?: string; errorMessage: string; status: "terminal_error" };

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
  return Boolean(root.FlexQueryResponse) || xml.includes("<FlexStatement");
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

export class IbkrFlexClient {
  constructor(private readonly config: IbkrFlexWorkerConfig) {}

  async sendRequest(args: {
    queryId: string;
    reportDate: string;
  }): Promise<{ referenceCode: string }> {
    const url = this.url("FlexStatementService.SendRequest", {
      date: args.reportDate,
      q: args.queryId,
    });
    const xml = await this.getText(url);
    const root = parseXml(xml);
    const referenceCode = findText(root, ["ReferenceCode", "referenceCode"]);
    if (referenceCode) return { referenceCode };

    const errorCode = findText(root, ["ErrorCode", "errorCode"]);
    const errorMessage =
      findText(root, ["ErrorMessage", "errorMessage", "Status", "status"]) ??
      "IBKR Flex SendRequest failed";
    throw new Error(
      `IBKR Flex SendRequest failed${errorCode ? ` (${errorCode})` : ""}: ${errorMessage}`,
    );
  }

  async getStatement(referenceCode: string): Promise<IbkrStatementResult> {
    const url = this.url("FlexStatementService.GetStatement", {
      q: referenceCode,
    });
    const xml = await this.getText(url);
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
      `IBKR Flex GetStatement failed${errorCode ? ` (${errorCode})` : ""}: ${errorMessage}`,
    );
  }

  private url(endpoint: string, params: Record<string, string>): URL {
    const url = new URL(`${this.config.ibkrFlexBaseUrl}/${endpoint}`);
    url.searchParams.set("t", this.config.ibkrFlexToken);
    url.searchParams.set("v", "3");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  private async getText(url: URL): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `IBKR Flex request failed ${response.status}: ${response.statusText}`,
      );
    }
    return await response.text();
  }
}
