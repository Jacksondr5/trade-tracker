import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getStandaloneTradePlanCard,
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
  await expect(page.getByTestId("trade-plan-back-link-desktop")).toBeVisible();
  await expect(
    page.getByTestId("trade-plan-trades-section-title"),
  ).toBeVisible();
});

test("standalone trade plans can be created from the list page", async ({
  page,
}) => {
  const createdPlanName = `${E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name} ${Date.now()}`;
  const createdTradePlanCard = getStandaloneTradePlanCard(page, createdPlanName);

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);
  const standaloneTradePlanCards = page.getByTestId(
    /^standalone-trade-plan-card-/,
  );
  const initialCardCount = await standaloneTradePlanCards.count();
  await expect(createdTradePlanCard).toHaveCount(0);

  await page.getByTestId("name-input").fill(createdPlanName);
  await page
    .getByTestId("instrumentSymbol-input")
    .fill(E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.instrumentSymbol);
  await page.getByTestId("create-trade-plan-button").click();

  await expect(standaloneTradePlanCards).toHaveCount(initialCardCount + 1);
  await expect(createdTradePlanCard).toContainText(createdPlanName);
});
