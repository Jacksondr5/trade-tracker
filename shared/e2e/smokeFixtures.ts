const TRADES_VIEWER_MATCH_DATES: ReadonlyArray<number> = Array.from(
  { length: 12 },
  (_, index) => Date.parse("2026-01-01T14:30:00.000Z") - index * 86_400_000,
);

export function getTradesViewerMatchDates(): number[] {
  return [...TRADES_VIEWER_MATCH_DATES];
}

const TRADES_VIEWER_MATCH_TRADES = TRADES_VIEWER_MATCH_DATES.map(
  (date, index) => ({
    assetType: "stock" as const,
    date,
    direction: "long" as const,
    fixtureKey: `viewer-match-aapl-${index}`,
    portfolio: "shared" as const,
    price: 100 + index,
    quantity: 1,
    side: "buy" as const,
    ticker: "AAPL",
    tradePlan: "linked" as const,
  }),
);

const TRADES_VIEWER_FILLER_TRADES = Array.from({ length: 55 }, (_, index) => ({
  assetType: "stock" as const,
  date: Date.parse("2026-01-10T15:00:00.000Z") - index * 60_000,
  direction: "long" as const,
  fixtureKey: `viewer-filler-msft-${index}`,
  portfolio: "shared" as const,
  price: 200 + index,
  quantity: 1,
  side: "buy" as const,
  ticker: `MSFT${index}`,
  tradePlan: "linked" as const,
}));

export const E2E_SMOKE_FIXTURES = {
  campaign: {
    name: "E2E Macro Rotation",
    status: "active" as const,
    thesis:
      "Synthetic preview-smoke campaign used to verify deployment wiring and hierarchy navigation.",
  },
  planningCampaign: {
    name: "E2E Planning Base",
    status: "planning" as const,
    thesis:
      "Synthetic planning campaign used to verify lifecycle filtering on the campaigns collection page.",
  },
  closedCampaign: {
    name: "E2E Closed Review",
    retrospective:
      "Synthetic retrospective for closed campaign lifecycle verification.",
    status: "closed" as const,
    thesis:
      "Synthetic closed campaign used to verify lifecycle filtering on the campaigns collection page.",
  },
  linkedTradePlan: {
    instrumentSymbol: "FCX",
    name: "E2E FCX Breakout",
    sortOrder: 10,
    status: "active" as const,
  },
  portfolio: {
    name: "E2E Core Portfolio",
  },
  standaloneTradePlan: {
    id: "seeded-standalone-trade-plan",
    instrumentSymbol: "BTC",
    name: "E2E BTC Mean Reversion",
    sortOrder: 20,
    status: "watching" as const,
  },
  createdStandaloneTradePlan: {
    instrumentSymbol: "AAPL",
    name: "E2E Created Standalone Plan",
  },
  trades: [
    {
      assetType: "stock" as const,
      date: Date.parse("2026-01-15T14:30:00.000Z"),
      direction: "long" as const,
      fixtureKey: "fcx-long-entry",
      portfolio: "shared" as const,
      price: 42.5,
      quantity: 10,
      side: "buy" as const,
      ticker: "FCX",
      tradePlan: "linked" as const,
    },
    {
      assetType: "crypto" as const,
      date: Date.parse("2026-01-20T15:00:00.000Z"),
      direction: "short" as const,
      fixtureKey: "btc-short-entry",
      portfolio: undefined,
      price: 98000,
      quantity: 1.5,
      side: "sell" as const,
      ticker: "BTC",
      tradePlan: "standalone" as const,
    },
    ...TRADES_VIEWER_FILLER_TRADES,
    ...TRADES_VIEWER_MATCH_TRADES,
  ],
  tradesViewerScenario: {
    matchDates: getTradesViewerMatchDates(),
  },
  inboxTrades: {
    linkedSuggested: {
      date: Date.parse("2026-02-05T14:30:00.000Z"),
      fixtureKey: "fcx-suggested-breakout",
      ticker: "FCX",
    },
    standaloneAssigned: {
      date: Date.parse("2026-02-07T15:00:00.000Z"),
      fixtureKey: "btc-assigned-retest",
      ticker: "BTC",
    },
  },
} as const;

export function getCreatedStandaloneTradePlanName(
  isLocalTarget: boolean,
): string {
  if (isLocalTarget) {
    return E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name;
  }

  return `${E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name}-${Date.now()}`;
}
