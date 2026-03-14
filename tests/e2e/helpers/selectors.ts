import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  getCampaignRowTestId,
  getStandaloneTradePlanCardTestId,
  getTradePlanLinkTestId,
  getTradeRowTickerTestId,
} from "../../../shared/e2e/testIds";

export const APP_PAGE_TITLES = {
  campaigns: "campaigns-page-title",
  positions: "positions-page-title",
  tradePlans: "trade-plans-page-title",
  trades: "trades-page-title",
} as const;

export const NAVIGATION_TEST_IDS = {
  campaigns: "nav-campaigns-link",
  positions: "nav-positions-link",
  tradePlans: "nav-trade-plans-link",
  trades: "nav-trades-link",
} as const;

export function getNavigationLink(
  page: Page,
  key: keyof typeof NAVIGATION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_TEST_IDS[key]);
}

export function getCampaignRow(page: Page): Locator {
  return page.getByTestId(
    getCampaignRowTestId(E2E_SMOKE_FIXTURES.campaign.name),
  );
}

export function getStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getTradePlanLinkTestId(E2E_SMOKE_FIXTURES.standaloneTradePlan.name),
  );
}

export function getCreatedTradePlanCard(page: Page): Locator {
  return page.getByTestId(
    getStandaloneTradePlanCardTestId(
      E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name,
    ),
  );
}

export function getLinkedTradeRow(page: Page): Locator {
  return page.getByTestId(
    getTradeRowTickerTestId(
      E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
    ),
  );
}
