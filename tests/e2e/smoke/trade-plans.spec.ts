import { expect, test } from "@playwright/test";
import {
  E2E_SMOKE_FIXTURES,
  getCreatedStandaloneTradePlanName,
} from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getCreatedTradePlanCard,
  getStandaloneTradePlanLink,
} from "../helpers/selectors";

test("seeded standalone trade plan and hierarchy render", async ({ page }) => {
  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

  await expect(getStandaloneTradePlanLink(page)).toBeVisible();

  await getStandaloneTradePlanLink(page).click();

  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId("trade-plan-name-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
  );
  await expect(page.getByTestId("trade-plan-symbol-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol,
  );
  await expect(page.getByTestId("trade-plan-back-link")).toBeVisible();
  await expect(
    page.getByTestId("trade-plan-trades-section-title"),
  ).toBeVisible();
});

test("standalone trade plans can be created from the list page", async ({
  page,
}) => {
  const createdPlanName = getCreatedStandaloneTradePlanName();

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);
  const initialCardCount = await page
    .getByTestId("standalone-trade-plan-card")
    .count();

  await page.getByTestId("name-input").fill(createdPlanName);
  await page
    .getByTestId("instrumentSymbol-input")
    .fill(E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.instrumentSymbol);
  await page.getByTestId("create-trade-plan-button").click();

  await expect(page.getByTestId("standalone-trade-plan-card")).toHaveCount(
    initialCardCount + 1,
  );
  await expect(getCreatedTradePlanCard(page)).toContainText(createdPlanName);
});
