import { describe, expect, it } from "vitest";
import { loadIbkrFlexWorkerConfig } from "./config";

describe("loadIbkrFlexWorkerConfig", () => {
  it("loads the required Temporal, IBKR, and Convex service settings", () => {
    expect(
      loadIbkrFlexWorkerConfig({
        BROKERAGE_INGESTION_BASE_URL: "https://example.convex.site/",
        BROKERAGE_INGESTION_TOKEN: "service-token",
        IBKR_FLEX_TOKEN: "ibkr-token",
        TEMPORAL_ADDRESS: "temporal:7233",
      }),
    ).toMatchObject({
      brokerageIngestionBaseUrl: "https://example.convex.site",
      temporalAddress: "temporal:7233",
      temporalNamespace: "trade-tracker",
      temporalTaskQueue: "trade-tracker-portfolio-pipeline",
    });
  });

  it("uses optional IBKR base URL override when provided", () => {
    expect(
      loadIbkrFlexWorkerConfig({
        BROKERAGE_INGESTION_BASE_URL: "https://example.convex.site",
        BROKERAGE_INGESTION_TOKEN: "service-token",
        IBKR_FLEX_BASE_URL: "https://api.ibkr.com/",
        IBKR_FLEX_TOKEN: "ibkr-token",
        TEMPORAL_ADDRESS: "temporal:7233",
      }).ibkrFlexBaseUrl,
    ).toBe("https://api.ibkr.com");
  });

  it("rejects an invalid optional IBKR base URL override", () => {
    expect(() =>
      loadIbkrFlexWorkerConfig({
        BROKERAGE_INGESTION_BASE_URL: "https://example.convex.site",
        BROKERAGE_INGESTION_TOKEN: "service-token",
        IBKR_FLEX_BASE_URL: "",
        IBKR_FLEX_TOKEN: "ibkr-token",
        TEMPORAL_ADDRESS: "temporal:7233",
      }),
    ).toThrow(/Invalid IBKR Flex worker environment/);
  });

  it("fails fast when required worker environment is missing", () => {
    expect(() => loadIbkrFlexWorkerConfig({})).toThrow(
      /Invalid IBKR Flex worker environment/,
    );
  });
});
