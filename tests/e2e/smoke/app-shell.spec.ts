import { expect, test } from "@playwright/test";
import {
  APP_SHELL_TEST_IDS,
  NAVIGATION_TEST_IDS,
  getLocalHierarchyItemTestId,
} from "../../../shared/e2e/testIds";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getCampaignRow,
  getNavigationLink,
  getNavigationSection,
  getMobileNavigationDrawer,
  getOpenNavigationDrawer,
  getPageTitle,
  getTradePlanNameDisplay,
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
  await expect(page.getByTestId(APP_SHELL_TEST_IDS.openCommandPaletteDesktop)).toBeVisible();

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

test("mobile navigation drawer reaches hierarchy destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await getCampaignRow(page).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);

  await expect(getOpenNavigationDrawer(page)).toBeVisible();
  await getOpenNavigationDrawer(page).click();

  const drawer = getMobileNavigationDrawer(page);
  const linkedTradePlanLink = drawer.getByTestId(
    getLocalHierarchyItemTestId(
      "campaign-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId(NAVIGATION_TEST_IDS.notes)).toBeVisible();
  await expect(linkedTradePlanLink).toBeVisible();

  await linkedTradePlanLink.click();
  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(getTradePlanNameDisplay(page)).toHaveText(
    E2E_SMOKE_FIXTURES.linkedTradePlan.name,
  );
  await expect(drawer).toHaveCount(0);
});
