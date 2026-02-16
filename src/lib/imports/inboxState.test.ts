import { describe, expect, it } from "vitest";
import { buildReviewedTradePatch } from "~/lib/imports/inboxState";

describe("buildReviewedTradePatch", () => {
  it("marks inbox row reviewed when user saves linkage", () => {
    expect(
      buildReviewedTradePatch({ campaignId: "c1", tradePlanId: "p1" })
    ).toEqual({
      campaignId: "c1",
      inboxStatus: "reviewed",
      tradePlanId: "p1",
    });
  });
});
