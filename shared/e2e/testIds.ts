function normalizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCampaignRowTestId(name: string): string {
  return `campaign-row-${normalizeSegment(name)}`;
}

export function getStandaloneTradePlanCardTestId(name: string): string {
  return `standalone-trade-plan-card-${normalizeSegment(name)}`;
}

export function getTradePlanLinkTestId(name: string): string {
  return `trade-plan-link-${normalizeSegment(name)}`;
}

export function getTradeRowTickerTestId(ticker: string): string {
  return `trade-row-ticker-${normalizeSegment(ticker)}`;
}
