import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IBKR_FLEX_REQUEST_TIMEOUT_MS,
  IbkrFlexClient,
  IbkrFlexTerminalError,
} from "./client";

const config = {
  token: "ibkr-token",
};

describe("Convex-compatible IbkrFlexClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the documented endpoint, version, token, and User-Agent", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<FlexStatementResponse><Status>Success</Status><ReferenceCode>12345</ReferenceCode></FlexStatementResponse>",
        ),
      );

    await expect(
      new IbkrFlexClient(config, fetchMock).sendRequest({ queryId: "67890" }),
    ).resolves.toEqual({ referenceCode: "12345" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=ibkr-token&v=3&q=67890",
    );
    expect(init).toMatchObject({
      headers: { "User-Agent": "TradeTracker/0.0.1" },
      signal: expect.any(AbortSignal),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies invalid credentials as terminal without embedding the request URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode><ErrorMessage>Token has expired</ErrorMessage></FlexStatementResponse>",
        ),
      );

    const request = new IbkrFlexClient(config, fetchMock).sendRequest({
      queryId: "67890",
    });
    await expect(request).rejects.toBeInstanceOf(IbkrFlexTerminalError);
    await expect(request).rejects.not.toThrow("ibkr-token");
  });

  it("distinguishes not-ready responses from terminal polling errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "<FlexStatementResponse><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress</ErrorMessage></FlexStatementResponse>",
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          "<FlexStatementResponse><ErrorCode>1012</ErrorCode><ErrorMessage>Invalid token</ErrorMessage></FlexStatementResponse>",
        ),
      );
    const client = new IbkrFlexClient(config, fetchMock);

    await expect(client.getStatement("12345")).resolves.toMatchObject({
      status: "not_ready",
    });
    await expect(client.getStatement("12345")).resolves.toEqual({
      errorCode: "1012",
      errorMessage: "Invalid token",
      status: "terminal_error",
    });
  });

  it("aborts hung fetches at the bounded action request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );

    const request = new IbkrFlexClient(config, fetchMock).getStatement("12345");
    const rejection = expect(request).rejects.toThrow(
      `IBKR Flex request timed out after ${IBKR_FLEX_REQUEST_TIMEOUT_MS}ms`,
    );
    await vi.advanceTimersByTimeAsync(IBKR_FLEX_REQUEST_TIMEOUT_MS);

    await rejection;
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
