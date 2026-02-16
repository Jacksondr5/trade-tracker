import { describe, expect, it } from "vitest";
import {
  resolveCampaignLinkage,
  tradeBelongsToCampaign,
} from "~/lib/imports/linkageValidation";

describe("resolveCampaignLinkage", () => {
  it("allows direct campaignId only when tradePlanId is unset", () => {
    expect(
      resolveCampaignLinkage({
        campaignId: "c1",
        tradePlanCampaignId: null,
        tradePlanId: null,
      })
    ).toBe("c1");

    expect(() =>
      resolveCampaignLinkage({
        campaignId: "c2",
        tradePlanCampaignId: "c1",
        tradePlanId: "p1",
      })
    ).toThrowError(/must match trade plan campaign/i);
  });
});

describe("tradeBelongsToCampaign", () => {
  it("includes directly linked campaign trades in campaign PL queries", () => {
    expect(
      tradeBelongsToCampaign({
        campaignId: "c1",
        tradeCampaignId: "c1",
        tradePlanCampaignId: null,
      })
    ).toBe(true);

    expect(
      tradeBelongsToCampaign({
        campaignId: "c1",
        tradeCampaignId: null,
        tradePlanCampaignId: "c1",
      })
    ).toBe(true);
  });
});
