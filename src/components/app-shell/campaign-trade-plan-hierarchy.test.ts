import { describe, expect, it } from "vitest";
import type { Id } from "~/convex/_generated/dataModel";
import {
  defaultPersistedLocalHierarchyState,
  getActiveHierarchyContext,
  isBravosGroupExpanded,
  isCampaignRowExpanded,
  isStandaloneGroupExpanded,
  supportsDesktopLocalHierarchy,
  type CampaignTradePlanHierarchy,
} from "./campaign-trade-plan-hierarchy-state";

const campaignAlphaId = "campaign_alpha" as Id<"campaigns">;
const campaignBetaId = "campaign_beta" as Id<"campaigns">;
const linkedTradePlanId = "tradeplan_linked" as Id<"tradePlans">;
const watchedTradePlanId = "tradeplan_watched" as Id<"tradePlans">;
const standaloneTradePlanId = "tradeplan_standalone" as Id<"tradePlans">;
const bravosTradePlanId = "tradeplan_bravos" as Id<"tradePlans">;

const hierarchy: CampaignTradePlanHierarchy = {
  bravosTradePlans: [
    {
      href: `/trade-plans/${bravosTradePlanId}`,
      id: bravosTradePlanId,
      instrumentSymbol: "QQQ",
      isWatched: false,
      itemType: "tradePlan",
      name: "Bravos Plan",
      navigationCategory: "bravos",
      parentCampaign: {
        href: `/campaigns/${campaignAlphaId}`,
        id: campaignAlphaId,
        name: "Alpha",
      },
      status: "active",
    },
  ],
  campaigns: [
    {
      defaultExpanded: false,
      href: `/campaigns/${campaignAlphaId}`,
      id: campaignAlphaId,
      isWatched: false,
      itemType: "campaign",
      name: "Alpha",
      status: "active",
      tradePlans: [
        {
          href: `/trade-plans/${linkedTradePlanId}`,
          id: linkedTradePlanId,
          instrumentSymbol: "AAPL",
          isWatched: false,
          itemType: "tradePlan",
          name: "Linked Plan",
          navigationCategory: "linked",
          parentCampaign: {
            href: `/campaigns/${campaignAlphaId}`,
            id: campaignAlphaId,
            name: "Alpha",
          },
          status: "watching",
        },
      ],
    },
    {
      defaultExpanded: true,
      href: `/campaigns/${campaignBetaId}`,
      id: campaignBetaId,
      isWatched: false,
      itemType: "campaign",
      name: "Beta",
      status: "planning",
      tradePlans: [
        {
          href: `/trade-plans/${watchedTradePlanId}`,
          id: watchedTradePlanId,
          instrumentSymbol: "MSFT",
          isWatched: true,
          itemType: "tradePlan",
          name: "Watched Child",
          navigationCategory: "linked",
          parentCampaign: {
            href: `/campaigns/${campaignBetaId}`,
            id: campaignBetaId,
            name: "Beta",
          },
          status: "idea",
        },
      ],
    },
  ],
  standaloneTradePlans: [
    {
      href: `/trade-plans/${standaloneTradePlanId}`,
      id: standaloneTradePlanId,
      instrumentSymbol: "TSLA",
      isWatched: false,
      itemType: "tradePlan",
      name: "Standalone",
      navigationCategory: "standalone",
      parentCampaign: null,
      status: "active",
    },
  ],
  watchlist: [],
};

describe("campaign trade plan hierarchy helpers", () => {
  it("finds the active campaign for linked trade-plan detail routes", () => {
    expect(
      getActiveHierarchyContext(`/trade-plans/${linkedTradePlanId}`, hierarchy),
    ).toEqual({
      activeCampaignId: campaignAlphaId,
      isBravosTradePlanActive: false,
      activeItemId: linkedTradePlanId,
      activeItemType: "tradePlan",
      isStandaloneTradePlanActive: false,
      routeSection: "trade-plans",
    });
  });

  it("treats unmatched trade-plan detail routes as standalone", () => {
    expect(
      getActiveHierarchyContext(
        `/trade-plans/${standaloneTradePlanId}`,
        hierarchy,
      ),
    ).toEqual({
      activeCampaignId: null,
      isBravosTradePlanActive: false,
      activeItemId: standaloneTradePlanId,
      activeItemType: "tradePlan",
      isStandaloneTradePlanActive: true,
      routeSection: "trade-plans",
    });
  });

  it("treats Bravos trade-plan detail routes as a dedicated local group", () => {
    expect(
      getActiveHierarchyContext(`/trade-plans/${bravosTradePlanId}`, hierarchy),
    ).toEqual({
      activeCampaignId: null,
      isBravosTradePlanActive: true,
      activeItemId: bravosTradePlanId,
      activeItemType: "tradePlan",
      isStandaloneTradePlanActive: false,
      routeSection: "trade-plans",
    });
  });

  it("respects persisted collapse state for campaigns", () => {
    const persistedState = {
      ...defaultPersistedLocalHierarchyState,
      campaignRows: {
        [campaignAlphaId]: false,
        [campaignBetaId]: false,
      },
    };

    expect(
      isCampaignRowExpanded(
        hierarchy.campaigns[0],
        persistedState,
        campaignAlphaId,
      ),
    ).toBe(false);
    expect(
      isCampaignRowExpanded(hierarchy.campaigns[1], persistedState, null),
    ).toBe(false);
  });

  it("opens active and watched-child campaigns by default until the user overrides them", () => {
    expect(
      isCampaignRowExpanded(
        hierarchy.campaigns[0],
        defaultPersistedLocalHierarchyState,
        campaignAlphaId,
      ),
    ).toBe(true);
    expect(
      isCampaignRowExpanded(
        hierarchy.campaigns[1],
        defaultPersistedLocalHierarchyState,
        null,
      ),
    ).toBe(true);
  });

  it("opens the standalone group by default for active standalone routes", () => {
    expect(
      isStandaloneGroupExpanded(defaultPersistedLocalHierarchyState, true),
    ).toBe(true);
  });

  it("keeps the standalone group closed by default away from standalone routes", () => {
    expect(isStandaloneGroupExpanded(defaultPersistedLocalHierarchyState)).toBe(
      false,
    );
  });

  it("opens the Bravos group by default for active Bravos routes", () => {
    expect(
      isBravosGroupExpanded(defaultPersistedLocalHierarchyState, true),
    ).toBe(true);
  });

  it("respects an explicit standalone-group expansion preference", () => {
    expect(
      isStandaloneGroupExpanded({
        ...defaultPersistedLocalHierarchyState,
        groups: {
          ...defaultPersistedLocalHierarchyState.groups,
          standaloneTradePlans: true,
        },
      }),
    ).toBe(true);
  });

  it("keeps the desktop rail enabled on the new campaign route", () => {
    expect(supportsDesktopLocalHierarchy("/campaigns/new")).toBe(true);
  });
});
