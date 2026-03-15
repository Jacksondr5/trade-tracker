import { expect, test, type Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getCommandPaletteInput,
  getEditCampaignName,
  getOpenCommandPaletteDesktop,
  getSeededCampaignChildrenToggle,
  getSeededCommandPaletteLinkedTradePlanItem,
  getSeededCommandPaletteWatchlistCampaignItem,
  getSeededCommandPaletteWatchlistLinkedTradePlanItem,
  getSeededCommandPaletteWatchlistStandaloneTradePlanItem,
  getSeededHierarchyCampaignLink,
  getSeededHierarchyLinkedTradePlanLink,
  getSeededHierarchyStandaloneTradePlanLink,
  getSeededLinkedTradePlanWatchToggle,
  getSeededWatchlistCampaignLink,
  getSeededWatchlistLinkedTradePlanLink,
  getSeededWatchlistLinkedTradePlanWatchToggle,
  getSeededWatchlistStandaloneTradePlanLink,
  getToggleLocalGroupStandaloneTradePlans,
  getTradePlanNameInput,
} from "../helpers/selectors";

async function ensureLinkedTradePlanNotInWatchlist(page: Page) {
  if (await getSeededWatchlistLinkedTradePlanLink(page).isVisible()) {
    await getSeededWatchlistLinkedTradePlanWatchToggle(page).click();
    await expect(getSeededWatchlistLinkedTradePlanLink(page)).toHaveCount(0);
  }

  await getOpenCommandPaletteDesktop(page).click();
  await getCommandPaletteInput(page).fill(
    E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
  );
  await expect(
    getSeededCommandPaletteWatchlistLinkedTradePlanItem(page),
  ).toHaveCount(0);
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toBeVisible();
}

test("local hierarchy supports campaign, linked trade plan, and standalone trade plan movement", async ({
  page,
}) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await expect(getSeededWatchlistCampaignLink(page)).toBeVisible();
  await expect(getSeededWatchlistStandaloneTradePlanLink(page)).toBeVisible();
  await expect(getSeededHierarchyCampaignLink(page)).toBeVisible();

  await getSeededCampaignChildrenToggle(page).click();
  await expect(getSeededHierarchyLinkedTradePlanLink(page)).toBeVisible();

  await getSeededHierarchyCampaignLink(page).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(getEditCampaignName(page)).toBeVisible();

  await getSeededHierarchyLinkedTradePlanLink(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(getTradePlanNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );

  await getToggleLocalGroupStandaloneTradePlans(page).click();
  await expect(getSeededHierarchyStandaloneTradePlanLink(page)).toBeVisible();

  await getSeededHierarchyStandaloneTradePlanLink(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(getTradePlanNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
  );
});

test("command palette jumps to watched campaigns and trade plans coherently", async ({
  page,
}) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await getOpenCommandPaletteDesktop(page).click();
  await getCommandPaletteInput(page).fill(E2E_SMOKE_FIXTURES.campaign.name);
  await expect(
    getSeededCommandPaletteWatchlistCampaignItem(page),
  ).toBeVisible();
  await getSeededCommandPaletteWatchlistCampaignItem(page).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(getEditCampaignName(page)).toBeVisible();

  await getOpenCommandPaletteDesktop(page).click();
  await getCommandPaletteInput(page).fill(
    E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
  );
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toBeVisible();
  await getSeededCommandPaletteLinkedTradePlanItem(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(getTradePlanNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );

  await getOpenCommandPaletteDesktop(page).click();
  await getCommandPaletteInput(page).fill(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol,
  );
  await expect(
    getSeededCommandPaletteWatchlistStandaloneTradePlanItem(page),
  ).toBeVisible();
  await getSeededCommandPaletteWatchlistStandaloneTradePlanItem(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(getTradePlanNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
  );
});

test("watchlist toggles stay in sync between hierarchy and command palette", async ({
  page,
}) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await getSeededCampaignChildrenToggle(page).click();
  await expect(getSeededWatchlistLinkedTradePlanLink(page)).toHaveCount(0);

  await getSeededLinkedTradePlanWatchToggle(page).click();
  await expect(getSeededWatchlistLinkedTradePlanLink(page)).toBeVisible();

  await getOpenCommandPaletteDesktop(page).click();
  await getCommandPaletteInput(page).fill(
    E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
  );
  await expect(
    getSeededCommandPaletteWatchlistLinkedTradePlanItem(page),
  ).toBeVisible();
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toHaveCount(0);

  await getSeededCommandPaletteWatchlistLinkedTradePlanItem(page).click();
  await expect(getTradePlanNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );
  await expect(getSeededWatchlistLinkedTradePlanLink(page)).toBeVisible();

  await ensureLinkedTradePlanNotInWatchlist(page);
});
