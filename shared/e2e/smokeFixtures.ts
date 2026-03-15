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
      "Synthetic closed campaign used to verify lifecycle filtering on the campaigns collection page.",
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
      notes: "[e2e-smoke] FCX long entry",
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
      notes: "[e2e-smoke] BTC short entry",
      portfolio: undefined,
      price: 98000,
      quantity: 1.5,
      side: "sell" as const,
      ticker: "BTC",
      tradePlan: "standalone" as const,
    },
  ],
} as const;

export function getCreatedStandaloneTradePlanName(
  isLocalTarget: boolean,
): string {
  if (isLocalTarget) {
    return E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name;
  }

  return `${E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name}-${Date.now()}`;
}
