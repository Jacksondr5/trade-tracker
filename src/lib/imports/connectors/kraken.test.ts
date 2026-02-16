import { describe, expect, it } from "vitest";
import { shouldContinueKrakenPaging } from "~/lib/imports/connectors/kraken";

describe("shouldContinueKrakenPaging", () => {
  it("stops paging once cursor boundary is reached", () => {
    expect(shouldContinueKrakenPaging(101, 100)).toBe(true);
    expect(shouldContinueKrakenPaging(100, 100)).toBe(false);
    expect(shouldContinueKrakenPaging(90, 100)).toBe(false);
  });

  it("continues when there is no cursor boundary", () => {
    expect(shouldContinueKrakenPaging(100, null)).toBe(true);
  });
});
