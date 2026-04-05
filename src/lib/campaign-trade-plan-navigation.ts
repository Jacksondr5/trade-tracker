export type CampaignNavigationStatus = "planning" | "active" | "closed";
export type TradePlanNavigationStatus =
  | "idea"
  | "watching"
  | "active"
  | "closed";

interface TradePlanRelationshipSource {
  navigationCategory: "bravos" | "linked" | "standalone";
  parentCampaign: {
    name: string;
  } | null;
}

export const BRAVOS_TRADE_LABEL = "Bravos Trade";
export const BRAVOS_TRADES_LABEL = "Bravos";
export const LINKED_TRADE_PLAN_LABEL = "Linked Trade Plan";
export const STANDALONE_TRADE_PLAN_LABEL = "Standalone Trade Plan";
export const STANDALONE_TRADE_PLANS_LABEL = "Standalone Trade Plans";

export function getTradePlanRelationshipLabel(
  tradePlan: TradePlanRelationshipSource,
): string {
  if (tradePlan.navigationCategory === "bravos") {
    return BRAVOS_TRADE_LABEL;
  }

  return tradePlan.parentCampaig2q3rwefdrgn === null
    ? STANDALONE_TRADE_PLAN_LABEL
    : LINKED_TRADE_PLAN_LABEL;
}

export function getTradePlanRelationshipContextLabel(
  tradePlan: TradePlanRelationshipSource,
): string {
  if (tradePlan.navigationCategory === "bravos") {
    return BRAVOS_TRADE_LABEL;
  }

  return tradePlan.parentCampaign?.name ?? STANDALONE_TRADE_PLAN_LABEL;
}

export interface ParentCampaignNavigationContext {
  href: string;
  id: string;
  name: string;
}

export interface CampaignNavigationItem {
  href: string;
  id: string;
  isWatched: boolean;
  itemType: "campaign";
  name: string;
  status: CampaignNavigationStatus;
}

export interface TradePlanNavigationItem {
  href: string;
  id: string;
  instrumentSymbol: string;
  isWatched: boolean;
  itemType: "tradePlan";
  name: string;
  navigationCategory: "bravos" | "linked" | "standalone";
  parentCampaign: ParentCampaignNavigationContext | null;
  status: TradePlanNavigationStatus;
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

export interface BreadcrumbSegment {
  href?: string;
  label: string;
}

export type CampaignTradePlanDetailRouteContext =
  | { campaignId: string; kind: "campaign" }
  | { kind: "tradePlan"; tradePlanId: string };

export function isCampaignTradePlanPathname(pathname: string): boolean {
  return (
    pathname === "/campaigns" ||
    pathname.startsWith("/campaigns/") ||
    pathname === "/trade-plans" ||
    pathname.startsWith("/trade-plans/")
  );
}

export function getCampaignTradePlanDetailRouteContext(
  pathname: string,
): CampaignTradePlanDetailRouteContext | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    return null;
  }

  if (segments[0] === "campaigns") {
    return { campaignId: segments[1], kind: "campaign" };
  }

  if (segments[0] === "trade-plans") {
    return { kind: "tradePlan", tradePlanId: segments[1] };
  }

  return null;
}

function findCampaignItem(
  hierarchy: CampaignTradePlanHierarchy,
  campaignId: string,
): CampaignHierarchyRow | null {
  return (
    hierarchy.campaigns.find((campaign) => campaign.id === campaignId) ?? null
  );
}

export function findTradePlanNavigationItem(
  hierarchy: CampaignTradePlanHierarchy,
  tradePlanId: string,
): TradePlanNavigationItem | null {
  for (const campaign of hierarchy.campaigns) {
    const linkedTradePlan =
      campaign.tradePlans.find((tradePlan) => tradePlan.id === tradePlanId) ??
      null;
    if (linkedTradePlan !== null) {
      return linkedTradePlan;
    }
  }

  return (
    hierarchy.bravosTradePlans.find(
      (tradePlan) => tradePlan.id === tradePlanId,
    ) ??
    hierarchy.standaloneTradePlans.find(
      (tradePlan) => tradePlan.id === tradePlanId,
    ) ??
    null
  );
}

function buildBravosTradePlanBreadcrumbs(
  tradePlan: TradePlanNavigationItem,
): BreadcrumbSegment[] {
  return [
    { href: "/trade-plans", label: "Trade Plans" },
    { label: BRAVOS_TRADES_LABEL },
    { label: tradePlan.name },
  ];
}

export function isBravosTradePlan(
  tradePlan: TradePlanRelationshipSource,
): boolean {
  return tradePlan.navigationCategory === "bravos";
}

export function findTradePlanNavigationBucketLabel(
  tradePlan: TradePlanNavigationItem,
): string {
  if (tradePlan.navigationCategory === "bravos") {
    return BRAVOS_TRADES_LABEL;
  }

  return tradePlan.parentCampaign === null
    ? STANDALONE_TRADE_PLAN_LABEL
    : tradePlan.parentCampaign.name;
}

export function buildTradePlanIndexRelationshipLabel(
  tradePlan: TradePlanRelationshipSource,
): string {
  if (tradePlan.navigationCategory === "bravos") {
    return BRAVOS_TRADES_LABEL;
  }

  if (tradePlan.navigationCategory === "linked") {
    return tradePlan.parentCampaign?.name ?? "Linked";
  }

  return "Standalone";
}

export function buildTradePlanBreadcrumbs(
  tradePlan: TradePlanNavigationItem,
): BreadcrumbSegment[] {
  if (tradePlan.navigationCategory === "bravos") {
    return buildBravosTradePlanBreadcrumbs(tradePlan);
  }

  if (tradePlan.parentCampaign === null) {
    return [
      { href: "/trade-plans", label: "Trade Plans" },
      { label: STANDALONE_TRADE_PLAN_LABEL },
      { label: tradePlan.name },
    ];
  }

  return [
    { href: "/campaigns", label: "Campaigns" },
    {
      href: tradePlan.parentCampaign.href,
      label: tradePlan.parentCampaign.name,
    },
    { label: tradePlan.name },
  ];
}

export function buildHierarchyBreadcrumbs(
  hierarchy: CampaignTradePlanHierarchy,
  routeContext: CampaignTradePlanDetailRouteContext,
): BreadcrumbSegment[] | null {
  if (routeContext.kind === "campaign") {
    const campaign = findCampaignItem(hierarchy, routeContext.campaignId);
    if (campaign === null) {
      return null;
    }

    return [
      { href: "/campaigns", label: "Campaigns" },
      { label: campaign.name },
    ];
  }

  const tradePlan = findTradePlanNavigationItem(
    hierarchy,
    routeContext.tradePlanId,
  );
  if (tradePlan === null) {
    return null;
  }

  return buildTradePlanBreadcrumbs(tradePlan);
}
