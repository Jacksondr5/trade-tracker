import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
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
} from "../helpers/selectors";

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
  await expect(page.getByTestId("edit-campaign-name")).toBeVisible();

  await getSeededHierarchyLinkedTradePlanLink(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );

  await page.getByTestId("toggle-local-group-standalone-trade-plans").click();
  await expect(getSeededHierarchyStandaloneTradePlanLink(page)).toBeVisible();

  await getSeededHierarchyStandaloneTradePlanLink(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
  );
});

test("command palette jumps to watched campaigns and trade plans coherently", async ({
  page,
}) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await page.getByTestId("open-command-palette-desktop").click();
  await page
    .getByTestId("command-palette-input")
    .fill(E2E_SMOKE_FIXTURES.campaign.name);
  await expect(
    getSeededCommandPaletteWatchlistCampaignItem(page),
  ).toBeVisible();
  await getSeededCommandPaletteWatchlistCampaignItem(page).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(page.getByTestId("edit-campaign-name")).toBeVisible();

  await page.getByTestId("open-command-palette-desktop").click();
  await page
    .getByTestId("command-palette-input")
    .fill(E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol);
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toBeVisible();
  await getSeededCommandPaletteLinkedTradePlanItem(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );

  await page.getByTestId("open-command-palette-desktop").click();
  await page
    .getByTestId("command-palette-input")
    .fill(E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol);
  await expect(
    getSeededCommandPaletteWatchlistStandaloneTradePlanItem(page),
  ).toBeVisible();
  await getSeededCommandPaletteWatchlistStandaloneTradePlanItem(page).click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
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

  await page.getByTestId("open-command-palette-desktop").click();
  await page
    .getByTestId("command-palette-input")
    .fill(E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol);
  await expect(
    getSeededCommandPaletteWatchlistLinkedTradePlanItem(page),
  ).toBeVisible();
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toHaveCount(0);

  await getSeededCommandPaletteWatchlistLinkedTradePlanItem(page).click();
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );
  await expect(getSeededWatchlistLinkedTradePlanLink(page)).toBeVisible();

  await getSeededWatchlistLinkedTradePlanWatchToggle(page).click();
  await expect(getSeededWatchlistLinkedTradePlanLink(page)).toHaveCount(0);

  await page.getByTestId("open-command-palette-desktop").click();
  await page
    .getByTestId("command-palette-input")
    .fill(E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol);
  await expect(
    getSeededCommandPaletteWatchlistLinkedTradePlanItem(page),
  ).toHaveCount(0);
  await expect(getSeededCommandPaletteLinkedTradePlanItem(page)).toBeVisible();
});
