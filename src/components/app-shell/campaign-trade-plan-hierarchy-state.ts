import type { Id } from "~/convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";
type TradePlanStatus = "idea" | "watching" | "active" | "closed";

export interface ParentCampaignContext {
  href: string;
  id: Id<"campaigns">;
  name: string;
}

export interface CampaignNavigationItem {
  href: string;
  id: Id<"campaigns">;
  isWatched: boolean;
  itemType: "campaign";
  name: string;
  status: CampaignStatus;
}

export interface TradePlanNavigationItem {
  href: string;
  id: Id<"tradePlans">;
  instrumentSymbol: string;
  isWatched: boolean;
  itemType: "tradePlan";
  name: string;
  parentCampaign: ParentCampaignContext | null;
  status: TradePlanStatus;
}

export interface CampaignHierarchyRow extends CampaignNavigationItem {
  defaultExpanded: boolean;
  tradePlans: TradePlanNavigationItem[];
}

export interface CampaignTradePlanHierarchy {
  campaigns: CampaignHierarchyRow[];
  standaloneTradePlans: TradePlanNavigationItem[];
  watchlist: Array<CampaignNavigationItem | TradePlanNavigationItem>;
}

export interface ActiveHierarchyContext {
  activeCampaignId: Id<"campaigns"> | null;
  activeItemId: Id<"campaigns"> | Id<"tradePlans"> | null;
  activeItemType: "campaign" | "tradePlan" | null;
  isStandaloneTradePlanActive: boolean;
  routeSection: "campaigns" | "trade-plans" | null;
}

export const localHierarchyStorageKey = "campaign-trade-plan-local-rail:v1";

export interface PersistedLocalHierarchyState {
  campaignRows: Record<string, boolean>;
  groups: {
    campaigns: boolean;
    standaloneTradePlans: boolean | null;
    watchlist: boolean;
  };
}

export const defaultPersistedLocalHierarchyState: PersistedLocalHierarchyState = {
  campaignRows: {},
  groups: {
    campaigns: true,
    standaloneTradePlans: null,
    watchlist: true,
  },
};

export function supportsDesktopLocalHierarchy(pathname: string): boolean {
  if (
    pathname === "/campaigns" ||
    pathname === "/campaigns/new" ||
    pathname === "/trade-plans"
  ) {
    return true;
  }

  if (pathname.startsWith("/campaigns/")) {
    const suffix = pathname.slice("/campaigns/".length);
    return suffix.length > 0 && !suffix.includes("/") && suffix !== "new";
  }

  if (pathname.startsWith("/trade-plans/")) {
    const suffix = pathname.slice("/trade-plans/".length);
    return suffix.length > 0 && !suffix.includes("/");
  }

  return false;
}

export function getActiveHierarchyContext(
  pathname: string,
  hierarchy: CampaignTradePlanHierarchy,
): ActiveHierarchyContext {
  if (pathname === "/campaigns") {
    return {
      activeCampaignId: null,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "campaigns",
    };
  }

  if (pathname === "/campaigns/new") {
    return {
      activeCampaignId: null,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "campaigns",
    };
  }

  if (pathname === "/trade-plans") {
    return {
      activeCampaignId: null,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "trade-plans",
    };
  }

  if (pathname.startsWith("/campaigns/")) {
    const campaignId = pathname.slice("/campaigns/".length);
    if (campaignId.length > 0 && !campaignId.includes("/") && campaignId !== "new") {
      return {
        activeCampaignId: campaignId as Id<"campaigns">,
        activeItemId: campaignId as Id<"campaigns">,
        activeItemType: "campaign",
        isStandaloneTradePlanActive: false,
        routeSection: "campaigns",
      };
    }
  }

  if (pathname.startsWith("/trade-plans/")) {
    const tradePlanId = pathname.slice("/trade-plans/".length);
    if (tradePlanId.length === 0 || tradePlanId.includes("/")) {
      return {
        activeCampaignId: null,
        activeItemId: null,
        activeItemType: null,
        isStandaloneTradePlanActive: false,
        routeSection: null,
      };
    }

    for (const campaign of hierarchy.campaigns) {
      const activeTradePlan = campaign.tradePlans.find((tradePlan) => tradePlan.id === tradePlanId);
      if (activeTradePlan !== undefined) {
        return {
          activeCampaignId: campaign.id,
          activeItemId: activeTradePlan.id,
          activeItemType: "tradePlan",
          isStandaloneTradePlanActive: false,
          routeSection: "trade-plans",
        };
      }
    }

    return {
      activeCampaignId: null,
      activeItemId: tradePlanId as Id<"tradePlans">,
      activeItemType: "tradePlan",
      isStandaloneTradePlanActive: true,
      routeSection: "trade-plans",
    };
  }

  return {
    activeCampaignId: null,
    activeItemId: null,
    activeItemType: null,
    isStandaloneTradePlanActive: false,
    routeSection: null,
  };
}

export function isCampaignRowExpanded(
  campaign: CampaignHierarchyRow,
  persistedState: PersistedLocalHierarchyState,
  activeCampaignId: Id<"campaigns"> | null,
): boolean {
  const persistedValue = persistedState.campaignRows[campaign.id];
  if (persistedValue !== undefined) {
    return persistedValue;
  }

  return campaign.id === activeCampaignId || campaign.defaultExpanded;
}

export function isStandaloneGroupExpanded(
  persistedState: PersistedLocalHierarchyState,
  isStandaloneTradePlanActive = false,
): boolean {
  const persistedValue = persistedState.groups.standaloneTradePlans;
  if (persistedValue !== null) {
    return persistedValue;
  }

  return isStandaloneTradePlanActive;
}
