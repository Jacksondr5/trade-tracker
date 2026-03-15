import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  APP_PAGE_TITLES,
  NAVIGATION_SECTION_TEST_IDS,
  NAVIGATION_TEST_IDS,
  getCommandPaletteItemTestId,
  getCampaignRowTestId,
  getLocalHierarchyCampaignChildrenToggleTestId,
  getLocalHierarchyItemTestId,
  getLocalHierarchyWatchToggleTestId,
  getStandaloneTradePlanCardTestId,
  getTradePlanLinkTestId,
  getTradeRowTestId,
} from "../../../shared/e2e/testIds";

export { APP_PAGE_TITLES, NAVIGATION_SECTION_TEST_IDS, NAVIGATION_TEST_IDS };

export function getNavigationLink(
  page: Page,
  key: keyof typeof NAVIGATION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_TEST_IDS[key]);
}

export function getNavigationSection(
  page: Page,
  key: keyof typeof NAVIGATION_SECTION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_SECTION_TEST_IDS[key]);
}

export function getPageTitle(
  page: Page,
  key: keyof typeof APP_PAGE_TITLES,
): Locator {
  return page.getByTestId(APP_PAGE_TITLES[key]);
}

export function getEditCampaignName(page: Page): Locator {
  return page.getByTestId("edit-campaign-name");
}

export function getTradePlanNameInput(page: Page): Locator {
  return page.getByTestId("trade-plan-name-input");
}

export function getToggleLocalGroupStandaloneTradePlans(page: Page): Locator {
  return page.getByTestId("toggle-local-group-standalone-trade-plans");
}

export function getOpenCommandPaletteDesktop(page: Page): Locator {
  return page.getByTestId("open-command-palette-desktop");
}

export function getCommandPaletteInput(page: Page): Locator {
  return page.getByTestId("command-palette-input");
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

export function getSeededCampaignChildrenToggle(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyCampaignChildrenToggleTestId(
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededHierarchyCampaignLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId("campaign", E2E_SMOKE_FIXTURES.campaign.name),
  );
}

export function getSeededHierarchyLinkedTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "campaign-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededHierarchyStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "standalone-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededWatchlistCampaignLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-campaign",
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededWatchlistLinkedTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededWatchlistStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededLinkedTradePlanWatchToggle(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyWatchToggleTestId(
      "campaign-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededWatchlistLinkedTradePlanWatchToggle(
  page: Page,
): Locator {
  return page.getByTestId(
    getLocalHierarchyWatchToggleTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistCampaignItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-campaign",
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistLinkedTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistStandaloneTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteLinkedTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}
