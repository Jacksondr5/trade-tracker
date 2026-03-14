import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES, getNavigationLink } from "../helpers/selectors";

test("authenticated app shell renders primary navigation", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await expect(getNavigationLink(page, "trades")).toBeVisible();
  await expect(getNavigationLink(page, "campaigns")).toBeVisible();
  await expect(getNavigationLink(page, "tradePlans")).toBeVisible();
  await expect(getNavigationLink(page, "positions")).toBeVisible();
  await expect(page.getByTestId("open-command-palette-desktop")).toBeVisible();
});
