import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getNavigationLink,
  getNavigationSection,
  getPageTitle,
} from "../helpers/selectors";

test("authenticated users are redirected from the entry page to dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL(/\/dashboard$/);
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.dashboard);
});

test("authenticated app shell renders primary navigation", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await expect(getNavigationSection(page, "activity")).toBeVisible();
  await expect(getNavigationSection(page, "review")).toBeVisible();
  await expect(getNavigationSection(page, "writing")).toBeVisible();
  await expect(getNavigationSection(page, "settings")).toBeVisible();

  await expect(getNavigationLink(page, "dashboard")).toBeVisible();
  await expect(getNavigationLink(page, "trades")).toBeVisible();
  await expect(getNavigationLink(page, "campaigns")).toBeVisible();
  await expect(getNavigationLink(page, "tradePlans")).toBeVisible();
  await expect(getNavigationLink(page, "portfolios")).toBeVisible();
  await expect(getNavigationLink(page, "imports")).toBeVisible();
  await expect(getNavigationLink(page, "positions")).toBeVisible();
  await expect(getNavigationLink(page, "notes")).toBeVisible();
  await expect(getNavigationLink(page, "strategy")).toBeVisible();
  await expect(getNavigationLink(page, "accounts")).toBeVisible();
  await expect(page.getByTestId("open-command-palette-desktop")).toBeVisible();

  const routeChecks = [
    ["dashboard", "dashboard", "/dashboard"],
    ["trades", "trades", "/trades"],
    ["campaigns", "campaigns", "/campaigns"],
    ["tradePlans", "tradePlans", "/trade-plans"],
    ["positions", "positions", "/positions"],
    ["portfolios", "portfolios", "/portfolios"],
    ["imports", "imports", "/imports"],
    ["notes", "notes", "/notes"],
    ["strategy", "strategy", "/strategy"],
    ["accounts", "accounts", "/accounts"],
  ] as const;

  for (const [navKey, pageKey, expectedPath] of routeChecks) {
    await getNavigationLink(page, navKey).click();
    await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
    await expect(getPageTitle(page, pageKey)).toBeVisible();
  }
});
