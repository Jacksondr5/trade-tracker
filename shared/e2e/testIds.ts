function normalizeSegment(value: string | number): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const APP_PAGE_TITLES = {
  dashboard: "dashboard-page-title",
  campaigns: "campaigns-page-title",
  positions: "positions-page-title",
  tradePlans: "trade-plans-page-title",
  trades: "trades-page-title",
} as const;

export const NAVIGATION_TEST_IDS = {
  dashboard: "nav-dashboard-link",
  campaigns: "nav-campaigns-link",
  positions: "nav-positions-link",
  tradePlans: "nav-trade-plans-link",
  trades: "nav-trades-link",
} as const;

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
