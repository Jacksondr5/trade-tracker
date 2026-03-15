import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  APP_PAGE_TITLES,
  NAVIGATION_TEST_IDS,
  getCampaignRowTestId,
  getStandaloneTradePlanCardTestId,
  getTradePlanLinkTestId,
  getTradeRowTestId,
} from "../../../shared/e2e/testIds";

export { APP_PAGE_TITLES, NAVIGATION_TEST_IDS };

export function getNavigationLink(
  page: Page,
  key: keyof typeof NAVIGATION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_TEST_IDS[key]);
}

export function getCampaignRow(page: Page): Locator {
  return getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name);
}

export function getCampaignRowByName(page: Page, name: string): Locator {
  return page.getByTestId(getCampaignRowTestId(name));
}

export function getStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getTradePlanLinkTestId(E2E_SMOKE_FIXTURES.standaloneTradePlan.name),
  );
}

export function getStandaloneTradePlanCard(page: Page, name: string): Locator {
  return page.getByTestId(getStandaloneTradePlanCardTestId(name));
}

export function getCreatedTradePlanCard(page: Page): Locator {
  return getStandaloneTradePlanCard(
    page,
    E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name,
  );
}

export function getLinkedTradeRow(page: Page): Locator {
  return page.getByTestId(
    getTradeRowTestId(
      E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
      E2E_SMOKE_FIXTURES.trades[0].date,
    ),
  );
}
