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
  navigationCategory: "bravos" | "linked" | "standalone";
  parentCampaign: ParentCampaignContext | null;
  status: TradePlanStatus;
}

export interface CampaignHierarchyRow extends CampaignNavigationItem {
  defaultExpanded: boolean;
  tradePlans: TradePlanNavigationItem[];
}

export interface CampaignTradePlanHierarchy {
  bravosTradePlans: TradePlanNavigationItem[];
  campaigns: CampaignHierarchyRow[];
  standaloneTradePlans: TradePlanNavigationItem[];
  watchlist: Array<CampaignNavigationItem | TradePlanNavigationItem>;
}

export interface ActiveHierarchyContext {
  activeCampaignId: Id<"campaigns"> | null;
  isBravosTradePlanActive: boolean;
  activeItemId: Id<"campaigns"> | Id<"tradePlans"> | null;
  activeItemType: "campaign" | "tradePlan" | null;
  isStandaloneTradePlanActive: boolean;
  routeSection: "campaigns" | "trade-plans" | null;
}

export const localHierarchyStorageKey = "campaign-trade-plan-local-rail:v1";

export interface PersistedLocalHierarchyState {
  campaignRows: Record<string, boolean>;
  groups: {
    bravosTradePlans: boolean | null;
    campaigns: boolean;
    standaloneTradePlans: boolean | null;
    watchlist: boolean;
  };
}

export const defaultPersistedLocalHierarchyState: PersistedLocalHierarchyState =
  {
    campaignRows: {},
    groups: {
      bravosTradePlans: null,
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
      isBravosTradePlanActive: false,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "campaigns",
    };
  }

  if (pathname === "/campaigns/new") {
    return {
      activeCampaignId: null,
      isBravosTradePlanActive: false,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "campaigns",
    };
  }

  if (pathname === "/trade-plans") {
    return {
      activeCampaignId: null,
      isBravosTradePlanActive: false,
      activeItemId: null,
      activeItemType: null,
      isStandaloneTradePlanActive: false,
      routeSection: "trade-plans",
    };
  }

  if (pathname.startsWith("/campaigns/")) {
    const campaignId = pathname.slice("/campaigns/".length);
    if (
      campaignId.length > 0 &&
      !campaignId.includes("/") &&
      campaignId !== "new"
    ) {
      return {
        activeCampaignId: campaignId as Id<"campaigns">,
        isBravosTradePlanActive: false,
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
        isBravosTradePlanActive: false,
        activeItemId: null,
        activeItemType: null,
        isStandaloneTradePlanActive: false,
        routeSection: null,
      };
    }

    const activeBravosTradePlan = hierarchy.bravosTradePlans.find(
      (tradePlan) => tradePlan.id === tradePlanId,
    );
    if (activeBravosTradePlan !== undefined) {
      return {
        activeCampaignId: null,
        isBravosTradePlanActive: true,
        activeItemId: activeBravosTradePlan.id,
        activeItemType: "tradePlan",
        isStandaloneTradePlanActive: false,
        routeSection: "trade-plans",
      };
    }

    for (const campaign of hierarchy.campaigns) {
      const activeTradePlan = campaign.tradePlans.find(
        (tradePlan) => tradePlan.id === tradePlanId,
      );
      if (activeTradePlan !== undefined) {
        return {
          activeCampaignId: campaign.id,
          isBravosTradePlanActive: false,
          activeItemId: activeTradePlan.id,
          activeItemType: "tradePlan",
          isStandaloneTradePlanActive: false,
          routeSection: "trade-plans",
        };
      }
    }

    return {
      activeCampaignId: null,
      isBravosTradePlanActive: false,
      activeItemId: tradePlanId as Id<"tradePlans">,
      activeItemType: "tradePlan",
      isStandaloneTradePlanActive: true,
      routeSection: "trade-plans",
    };
  }

  return {
    activeCampaignId: null,
    isBravosTradePlanActive: false,
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

export function isBravosGroupExpanded(
  persistedState: PersistedLocalHierarchyState,
  isBravosTradePlanActive = false,
): boolean {
  const persistedValue = persistedState.groups.bravosTradePlans;
  if (persistedValue !== null) {
    return persistedValue;
  }

  return isBravosTradePlanActive;
}
