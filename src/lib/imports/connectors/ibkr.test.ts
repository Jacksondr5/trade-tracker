import { describe, expect, it } from "vitest";
import {
  createIbkrLimiter,
  mapIbkrPreflightToConnectionStatus,
} from "~/lib/imports/connectors/ibkr";

describe("createIbkrLimiter", () => {
  it("enforces 5-second minimum spacing for trades endpoint", async () => {
    const limiter = createIbkrLimiter();

    expect(await limiter(1_000)).toBe(0);
    expect(await limiter(2_000)).toBe(4_000);
    expect(await limiter(8_000)).toBe(3_000);
  });
});

describe("mapIbkrPreflightToConnectionStatus", () => {
  it("returns needs_reauth when preflight shows expired session", () => {
    expect(
      mapIbkrPreflightToConnectionStatus({ authenticated: false })
    ).toBe("needs_reauth");
  });
});
