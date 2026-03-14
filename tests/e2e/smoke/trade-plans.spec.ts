import { expect, test } from "@playwright/test";
import {
  E2E_SMOKE_FIXTURES,
  buildCreatedStandaloneTradePlanName,
} from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import { getStandaloneTradePlanLink } from "../helpers/selectors";

test("seeded standalone trade plan and hierarchy render", async ({ page }) => {
  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, "Trade Plans");

  await expect(getStandaloneTradePlanLink(page)).toBeVisible();

  await getStandaloneTradePlanLink(page).click();

  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(
    page.getByLabel("Plan Name"),
  ).toHaveValue(E2E_SMOKE_FIXTURES.standaloneTradePlan.name);
  await expect(
    page.getByLabel("Instrument Symbol"),
  ).toHaveValue(E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol);
  await expect(page.getByRole("link", { name: /Back to Trade Plans/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
});

test("standalone trade plans can be created from the list page", async ({ page }) => {
  const uniquePlanName = buildCreatedStandaloneTradePlanName(Date.now());

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, "Trade Plans");

  await page.getByTestId("name-input").fill(uniquePlanName);
  await page.getByTestId("instrumentSymbol-input").fill("AAPL");
  await page.getByTestId("create-trade-plan-button").click();

  await expect(page.getByRole("link", { name: uniquePlanName })).toBeVisible();
});
