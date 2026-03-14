import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import { getCampaignRow } from "../helpers/selectors";

test("seeded campaign is visible and detail page loads", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, "Campaigns");

  await expect(getCampaignRow(page)).toBeVisible();
  await getCampaignRow(page).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(
    page.getByRole("textbox", { name: "Campaign Name" }),
  ).toHaveValue(E2E_SMOKE_FIXTURES.campaign.name);
  await expect(
    page.getByRole("textbox", { name: "Thesis" }),
  ).toHaveValue(E2E_SMOKE_FIXTURES.campaign.thesis);
});
