import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { getTradeRowsForTicker } from "../helpers/selectors";

test("seeded trades and positions stay coherent", async ({ page }) => {
  await page.goto("/trades");

  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
  await page
    .getByTestId("trades-filter-ticker")
    .fill(E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol);

  await expect(
    getTradeRowsForTicker(page, E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol),
  ).toHaveCount(1);

  await page.goto("/positions");

  await expect(page.getByRole("heading", { name: "Positions" })).toBeVisible();
  await expect(page.getByTestId("position-row-FCX-long")).toBeVisible();
  await expect(page.getByTestId("position-row-BTC-short")).toBeVisible();
});
