import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";

export function getCampaignRow(page: Page): Locator {
  return page
    .locator("[data-testid^='campaign-card-']")
    .filter({ hasText: E2E_SMOKE_FIXTURES.campaign.name });
}

export function getStandaloneTradePlanLink(page: Page): Locator {
  return page.getByRole("link", {
    exact: true,
    name: `${E2E_SMOKE_FIXTURES.standaloneTradePlan.name} ${E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol}`,
  });
}

export function getTradeRowsForTicker(page: Page, ticker: string): Locator {
  return page.locator("tbody tr").filter({ hasText: ticker });
}
