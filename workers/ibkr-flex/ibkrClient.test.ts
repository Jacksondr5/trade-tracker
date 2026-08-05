import { afterEach, describe, expect, it, vi } from "vitest";
import type { IbkrFlexWorkerConfig } from "./config";
import { IbkrFlexClient } from "./ibkrClient";

const config: IbkrFlexWorkerConfig = {
  brokerageIngestionBaseUrl: "https://example.convex.site",
  brokerageIngestionToken: "service-token",
  ibkrFlexBaseUrl:
    "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService",
  ibkrFlexToken: "ibkr-token",
  temporalAddress: "temporal:7233",
  temporalNamespace: "trade-tracker",
  temporalTaskQueue: "trade-tracker-portfolio-pipeline",
};

describe("IbkrFlexClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the documented SendRequest endpoint, version, and User-Agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<FlexStatementResponse><Status>Success</Status><ReferenceCode>12345</ReferenceCode></FlexStatementResponse>",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new IbkrFlexClient(config).sendRequest({
        queryId: "67890",
        reportDate: "2026-08-03",
      }),
    ).resolves.toEqual({ referenceCode: "12345" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=ibkr-token&v=3&q=67890",
    );
    expect(init.headers).toEqual({ "User-Agent": "TradeTracker/0.0.1" });
  });

  it("uses the configured base URL for GetStatement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<FlexStatement><AccountInformation /></FlexStatement>"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new IbkrFlexClient({
        ...config,
        ibkrFlexBaseUrl: "https://flex.example.test/custom",
      }).getStatement("12345"),
    ).resolves.toMatchObject({ status: "ready" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://flex.example.test/custom/GetStatement?t=ibkr-token&v=3&q=12345",
    );
    expect(init.headers).toEqual({ "User-Agent": "TradeTracker/0.0.1" });
  });
});
