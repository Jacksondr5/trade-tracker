import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES, getLinkedTradeRow } from "../helpers/selectors";

test("seeded trades and positions stay coherent", async ({ page }) => {
  await page.goto("/trades");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

  await page
    .getByTestId("trades-filter-ticker")
    .fill(E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol);

  await expect(getLinkedTradeRow(page)).toBeVisible();

  await page.goto("/positions");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.positions);

  await expect(page.getByTestId("position-row-FCX-long")).toBeVisible();
  await expect(page.getByTestId("position-row-BTC-short")).toBeVisible();
});
