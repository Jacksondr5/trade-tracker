import { describe, expect, it } from "vitest";
import {
  buildHierarchyBreadcrumbs,
  getCampaignTradePlanDetailRouteContext,
  isCampaignTradePlanPathname,
  type CampaignTradePlanHierarchy,
} from "./campaign-trade-plan-navigation";

const hierarchy: CampaignTradePlanHierarchy = {
  campaigns: [
    {
      defaultExpanded: true,
      href: "/campaigns/campaign-1",
      id: "campaign-1",
      isWatched: true,
      itemType: "campaign",
      name: "Commodity Run Up",
      status: "active",
      tradePlans: [
        {
          href: "/trade-plans/trade-plan-1",
          id: "trade-plan-1",
          instrumentSymbol: "URNM",
          isWatched: false,
          itemType: "tradePlan",
          name: "URNM Breakout",
          parentCampaign: {
            href: "/campaigns/campaign-1",
            id: "campaign-1",
            name: "Commodity Run Up",
          },
          status: "watching",
        },
      ],
    },
  ],
  standaloneTradePlans: [
    {
      href: "/trade-plans/trade-plan-2",
      id: "trade-plan-2",
      instrumentSymbol: "ARKK",
      isWatched: true,
      itemType: "tradePlan",
      name: "Short ARKK",
      parentCampaign: null,
      status: "idea",
    },
  ],
  watchlist: [],
};

describe("campaign trade plan navigation helpers", () => {
  it("detects campaign and trade-plan domain routes", () => {
    expect(isCampaignTradePlanPathname("/campaigns")).toBe(true);
    expect(isCampaignTradePlanPathname("/campaigns/campaign-1")).toBe(true);
    expect(isCampaignTradePlanPathname("/campaigns/campaign-1/notes")).toBe(true);
    expect(isCampaignTradePlanPathname("/trade-plans/trade-plan-1")).toBe(true);
    expect(isCampaignTradePlanPathname("/trade-plans/trade-plan-1/history")).toBe(true);
    expect(isCampaignTradePlanPathname("/notes")).toBe(false);
  });

  it("parses detail route context from the pathname", () => {
    expect(getCampaignTradePlanDetailRouteContext("/campaigns/campaign-1")).toEqual({
      campaignId: "campaign-1",
      kind: "campaign",
    });
    expect(
      getCampaignTradePlanDetailRouteContext("/trade-plans/trade-plan-1"),
    ).toEqual({
      kind: "tradePlan",
      tradePlanId: "trade-plan-1",
    });
    expect(getCampaignTradePlanDetailRouteContext("/campaigns")).toBeNull();
    expect(getCampaignTradePlanDetailRouteContext("/campaigns/")).toBeNull();
  });

  it("builds campaign breadcrumbs from shared hierarchy data", () => {
    expect(
      buildHierarchyBreadcrumbs(hierarchy, {
        campaignId: "campaign-1",
        kind: "campaign",
      }),
    ).toEqual([
      { href: "/campaigns", label: "Campaigns" },
      { label: "Commodity Run Up" },
    ]);
  });

  it("builds linked trade-plan breadcrumbs from shared hierarchy data", () => {
    expect(
      buildHierarchyBreadcrumbs(hierarchy, {
        kind: "tradePlan",
        tradePlanId: "trade-plan-1",
      }),
    ).toEqual([
      { href: "/campaigns", label: "Campaigns" },
      { href: "/campaigns/campaign-1", label: "Commodity Run Up" },
      { label: "URNM Breakout" },
    ]);
  });

  it("builds standalone trade-plan breadcrumbs from shared hierarchy data", () => {
    expect(
      buildHierarchyBreadcrumbs(hierarchy, {
        kind: "tradePlan",
        tradePlanId: "trade-plan-2",
      }),
    ).toEqual([
      { href: "/trade-plans", label: "Trade Plans" },
      { label: "Standalone" },
      { label: "Short ARKK" },
    ]);
  });
});
