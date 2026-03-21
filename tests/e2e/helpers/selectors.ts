import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  APP_PAGE_TITLES,
  APP_SHELL_TEST_IDS,
  NAVIGATION_SECTION_TEST_IDS,
  NAVIGATION_TEST_IDS,
  getCommandPaletteItemTestId,
  getCampaignRowTestId,
  getLocalHierarchyCampaignChildrenToggleTestId,
  getLocalHierarchyItemTestId,
  getLocalHierarchyWatchToggleTestId,
  getStandaloneTradePlanCardTestId,
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
  return page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName);
}

export function getTradePlanNameInput(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput);
}

export function getNameInput(page: Page): Locator {
  return page.getByTestId("name-input");
}

export function getThesisTextarea(page: Page): Locator {
  return page.getByTestId("thesis-textarea");
}

export function getInstrumentSymbolInput(page: Page): Locator {
  return page.getByTestId("instrumentSymbol-input");
}

export function getCreateTradePlanButton(page: Page): Locator {
  return page.getByTestId("create-trade-plan-button");
}

export function getCreateCampaignButton(page: Page): Locator {
  return page.getByTestId("create-campaign-button");
}

export function getCreateLinkedTradePlanButton(page: Page): Locator {
  return page.getByTestId("create-linked-trade-plan-button");
}

export function getCampaignStatusSelect(page: Page): Locator {
  return page.getByTestId("campaign-status-select");
}

export function getNewCampaignPageTitle(page: Page): Locator {
  return page.getByTestId("new-campaign-page-title");
}

export function getToggleLocalGroupStandaloneTradePlans(page: Page): Locator {
  return page.getByTestId(
    APP_SHELL_TEST_IDS.toggleLocalGroupStandaloneTradePlans,
  );
}

export function getOpenCommandPaletteDesktop(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.openCommandPaletteDesktop);
}

export function getCommandPaletteInput(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.commandPaletteInput);
}

export function getCampaignRow(page: Page): Locator {
  return getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name);
}

export function getCampaignRowByName(page: Page, name: string): Locator {
  return page.getByTestId(getCampaignRowTestId(name));
}

export function getStandaloneTradePlanLink(page: Page): Locator {
  return page
    .getByTestId(/^standalone-trade-plan-card-/)
    .filter({ hasText: E2E_SMOKE_FIXTURES.standaloneTradePlan.name })
    .getByTestId(/^trade-plan-link-/);
}

export async function getSeededStandaloneTradePlanId(
  page: Page,
): Promise<string> {
  return getTradePlanIdFromHref(getStandaloneTradePlanLink(page));
}

async function getTradePlanIdFromHref(locator: Locator): Promise<string> {
  const href = await locator.getAttribute("href");
  const tradePlanId = href?.match(/\/trade-plans\/([^/]+)$/)?.[1];

  if (!tradePlanId) {
    throw new Error("Expected trade plan id in link href.");
  }

  return tradePlanId;
}

export async function getNewTradePlanIdFromListPage(
  page: Page,
  previousHrefs: Set<string>,
): Promise<string> {
  const createdHref = (
    (await page
      .getByTestId(/^trade-plan-link-/)
      .evaluateAll(
        (elements, priorHrefs) =>
          elements
            .map((element) => element.getAttribute("href"))
            .filter(
              (href): href is string =>
                Boolean(href) && !priorHrefs.includes(href),
            ),
        Array.from(previousHrefs),
      )) as string[]
  )[0];

  if (!createdHref) {
    throw new Error("Expected a new trade plan link after creation.");
  }

  const createdTradePlanId = createdHref.match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!createdTradePlanId) {
    throw new Error("Expected created trade plan id in list link.");
  }

  return createdTradePlanId;
}

export async function getOnlyLinkedTradePlanIdFromCampaignDetail(
  page: Page,
): Promise<string> {
  const linkedTradePlanRows = page.getByTestId(/^linked-trade-plan-row-/);
  await expect(linkedTradePlanRows).toHaveCount(1);

  const linkedTradePlanRowTestId = await linkedTradePlanRows
    .first()
    .getAttribute("data-testid");

  if (!linkedTradePlanRowTestId) {
    throw new Error("Expected data-testid on linked trade plan row.");
  }

  return linkedTradePlanRowTestId.replace("linked-trade-plan-row-", "");
}

export function getStandaloneTradePlanCard(page: Page, id: string): Locator {
  return page.getByTestId(getStandaloneTradePlanCardTestId(id));
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
