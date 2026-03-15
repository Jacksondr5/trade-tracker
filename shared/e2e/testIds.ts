function normalizeSegment(value: string | number): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const APP_PAGE_TITLES = {
  accounts: "accounts-page-title",
  campaigns: "campaigns-page-title",
  dashboard: "dashboard-page-title",
  imports: "imports-page-title",
  notes: "notes-page-title",
  portfolios: "portfolios-page-title",
  positions: "positions-page-title",
  strategy: "strategy-page-title",
  tradePlans: "trade-plans-page-title",
  trades: "trades-page-title",
} as const;

export const NAVIGATION_TEST_IDS = {
  accounts: "nav-accounts-link",
  campaigns: "nav-campaigns-link",
  dashboard: "nav-dashboard-link",
  imports: "nav-imports-link",
  notes: "nav-notes-link",
  portfolios: "nav-portfolios-link",
  positions: "nav-positions-link",
  strategy: "nav-strategy-link",
  tradePlans: "nav-trade-plans-link",
  trades: "nav-trades-link",
} as const;

export const NAVIGATION_SECTION_TEST_IDS = {
  activity: "nav-section-activity",
  review: "nav-section-review",
  settings: "nav-section-settings",
  writing: "nav-section-writing",
} as const;

type CommandPaletteScope =
  | "campaign"
  | "trade-plan"
  | "watchlist-campaign"
  | "watchlist-trade-plan";

type LocalHierarchyItemScope =
  | "campaign"
  | "campaign-trade-plan"
  | "standalone-trade-plan"
  | "watchlist-campaign"
  | "watchlist-trade-plan";

export function getCampaignRowTestId(name: string): string {
  return `campaign-row-${normalizeSegment(name)}`;
}

export function getStandaloneTradePlanCardTestId(name: string): string {
  return `standalone-trade-plan-card-${normalizeSegment(name)}`;
}

export function getTradePlanLinkTestId(name: string): string {
  return `trade-plan-link-${normalizeSegment(name)}`;
}

export function getTradeRowTestId(
  ticker: string,
  uniqueKey: string | number,
): string {
  return `trade-row-${normalizeSegment(ticker)}-${normalizeSegment(uniqueKey)}`;
}

export function getCommandPaletteItemTestId(
  scope: CommandPaletteScope,
  key: string,
): string {
  return `command-palette-${scope}-${normalizeSegment(key)}`;
}

export function getLocalHierarchyCampaignChildrenToggleTestId(
  campaignName: string,
): string {
  return `toggle-campaign-children-${normalizeSegment(campaignName)}`;
}

export function getLocalHierarchyItemTestId(
  scope: LocalHierarchyItemScope,
  key: string,
): string {
  return `local-hierarchy-${scope}-${normalizeSegment(key)}`;
}

export function getLocalHierarchyWatchToggleTestId(
  scope: LocalHierarchyItemScope,
  key: string,
): string {
  return `local-hierarchy-watch-toggle-${scope}-${normalizeSegment(key)}`;
}
