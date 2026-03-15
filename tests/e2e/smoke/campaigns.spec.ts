import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getCampaignRow,
  getCampaignRowByName,
} from "../helpers/selectors";

test("seeded campaign is visible and detail page loads", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toBeVisible();

  await page.getByTestId("status-filter-planning").click();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name),
  ).toHaveCount(0);
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toHaveCount(0);

  await page.getByTestId("status-filter-closed").click();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toHaveCount(0);

  await page.getByTestId("status-filter-all").click();
  await expect(getCampaignRow(page)).toBeVisible();
  await getCampaignRow(page).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(page.getByTestId("campaign-status-select")).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.status,
  );
  await page.getByTestId("edit-campaign-name").click();
  await expect(page.getByTestId("name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.name,
  );
  await page.getByTestId("edit-thesis").click();
  await expect(page.getByTestId("thesis-textarea")).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.thesis,
  );
});
