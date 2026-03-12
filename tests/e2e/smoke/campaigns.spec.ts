import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { getCampaignRow } from "../helpers/selectors";

test("seeded campaign is visible and detail page loads", async ({ page }) => {
  await page.goto("/campaigns");

  await expect(getCampaignRow(page)).toBeVisible();
  await getCampaignRow(page).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(
    page.getByDisplayValue(E2E_SMOKE_FIXTURES.campaign.name),
  ).toBeVisible();
  await expect(
    page.getByDisplayValue(E2E_SMOKE_FIXTURES.campaign.thesis),
  ).toBeVisible();
});
