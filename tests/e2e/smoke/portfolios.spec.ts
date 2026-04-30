import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  PORTFOLIO_CASH_LEDGER_TEST_IDS,
  PORTFOLIO_DETAIL_TEST_IDS,
  getPortfolioLinkTestId,
  getPortfolioOpenPositionRowTestId,
  getPortfolioRowTestId,
} from "../../../shared/e2e/testIds";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES } from "../helpers/selectors";

test("portfolio detail surfaces overview analytics for the seeded portfolio", async ({
  page,
}) => {
  await page.goto("/portfolios");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.portfolios);

  const portfolioRow = page.getByTestId(
    getPortfolioRowTestId(E2E_SMOKE_FIXTURES.portfolio.name),
  );
  await expect(portfolioRow).toBeVisible();
  await page
    .getByTestId(getPortfolioLinkTestId(E2E_SMOKE_FIXTURES.portfolio.name))
    .click();

  await expect(page).toHaveURL(/\/portfolios\/[^/]+$/);

  // Title and summary surfaces are visible (overview pattern)
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameDisplay),
  ).toContainText(E2E_SMOKE_FIXTURES.portfolio.name);
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.asOfDate),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.summarySection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.summaryCash),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.summaryMarketValue),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.summaryTotalEquity),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.returnPercent),
  ).toBeVisible();

  // Equity chart section renders (with empty-state since no valuations are seeded)
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.equityChartSection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.timeframeSelect),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.emptyValuationState),
  ).toBeVisible();

  // Allocation, open positions, campaign exposure, recent trades, cash ledger are present
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.allocationSection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.openPositionsSection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.campaignExposureSection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.recentTradesSection),
  ).toBeVisible();
  await expect(
    page.getByTestId(PORTFOLIO_CASH_LEDGER_TEST_IDS.section),
  ).toBeVisible();

  // The seeded FCX long trade should produce a long open position
  const fcxPositionRow = page.getByTestId(
    getPortfolioOpenPositionRowTestId(
      "stock",
      E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
      "long",
    ),
  );
  await expect(fcxPositionRow).toBeVisible();

  // Campaign exposure surface includes the seeded campaign through the trade plan
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.campaignExposureSection),
  ).toContainText(
    E2E_SMOKE_FIXTURES.campaign.name,
  );
});

test("portfolio detail supports rename, cancel, and delete-confirmation", async ({
  page,
}) => {
  const timestamp = Date.now();
  const createdName = `E2E Portfolio Lifecycle ${timestamp}`;
  const updatedName = `${createdName} Updated`;

  await page.goto("/portfolios");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.portfolios);

  // Create a fresh portfolio so we can mutate it without affecting other specs
  await page.getByTestId("name-input").fill(createdName);
  await page.getByTestId("create-portfolio-button").click();

  const newRow = page.getByTestId(getPortfolioRowTestId(createdName));
  await expect(newRow).toBeVisible();
  await page.getByTestId(getPortfolioLinkTestId(createdName)).click();

  await expect(page).toHaveURL(/\/portfolios\/[^/]+$/);
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameDisplay),
  ).toContainText(createdName);

  // Rename flow
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.editNameButton).click();
  await page
    .getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameInput)
    .fill(updatedName);
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.saveNameButton).click();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameDisplay),
  ).toContainText(updatedName);

  // Cancel-edit flow keeps the saved name
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.editNameButton).click();
  await page
    .getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameInput)
    .fill(`${updatedName} aborted`);
  await page
    .getByTestId(PORTFOLIO_DETAIL_TEST_IDS.cancelEditNameButton)
    .click();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.nameDisplay),
  ).toContainText(updatedName);

  // Delete confirmation can be cancelled without destroying the portfolio
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.deleteButton).click();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.confirmDeleteButton),
  ).toBeVisible();
  await page
    .getByTestId(PORTFOLIO_DETAIL_TEST_IDS.cancelDeleteButton)
    .click();
  await expect(
    page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.deleteButton),
  ).toBeVisible();

  // Confirming delete navigates back to the list and removes the portfolio
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.deleteButton).click();
  await page.getByTestId(PORTFOLIO_DETAIL_TEST_IDS.confirmDeleteButton).click();
  await expect(page).toHaveURL(/\/portfolios$/);
  await expect(
    page.getByTestId(getPortfolioRowTestId(updatedName)),
  ).toHaveCount(0);
});
