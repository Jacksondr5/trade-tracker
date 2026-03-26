import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { getTradeRowTestId } from "../../../shared/e2e/testIds";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getLinkedTradeRow,
  getTradesFilterTicker,
  getTradesFilteredEmptyState,
  getTradesPageSizeSelect,
  getTradesPaginationNext,
  getTradesPaginationPrev,
} from "../helpers/selectors";

const SEEDED_BTC_TRADE_ROW = getTradeRowTestId(
  E2E_SMOKE_FIXTURES.trades[1].ticker,
  E2E_SMOKE_FIXTURES.trades[1].date,
);
const VIEWER_MATCH_DATES = E2E_SMOKE_FIXTURES.tradesViewerScenario.matchDates;

test.describe("trades viewer regression", () => {
  test("ticker filtering is partial, case-insensitive, and reversible", async ({
    page,
  }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    await getTradesFilterTicker(page).fill("fc");
    await expect(getLinkedTradeRow(page)).toBeVisible();
    await expect(page.getByTestId(SEEDED_BTC_TRADE_ROW)).toHaveCount(0);

    await getTradesFilterTicker(page).fill("  bt ");
    await expect(page.getByTestId(SEEDED_BTC_TRADE_ROW)).toBeVisible();
    await expect(getLinkedTradeRow(page)).toHaveCount(0);

    await getTradesFilterTicker(page).fill("");
    await expect(getLinkedTradeRow(page)).toBeVisible();
    await expect(page.getByTestId(SEEDED_BTC_TRADE_ROW)).toBeVisible();
  });

  test("non-matching ticker shows the filtered empty state", async ({ page }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    await getTradesFilterTicker(page).fill("ZZZZZZZ");

    await expect(getTradesFilteredEmptyState(page)).toBeVisible();
    await expect(getLinkedTradeRow(page)).toHaveCount(0);
    await expect(page.getByTestId(SEEDED_BTC_TRADE_ROW)).toHaveCount(0);
  });

  test("ticker filtering paginates across multi-batch results without crashing", async ({
    page,
  }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    await getTradesPageSizeSelect(page).selectOption("10");
    await getTradesFilterTicker(page).fill("aa");

    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[0])),
    ).toBeVisible();
    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[9])),
    ).toBeVisible();
    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[10])),
    ).toHaveCount(0);
    await expect(getTradesPaginationPrev(page)).toBeDisabled();
    await expect(getTradesPaginationNext(page)).toBeEnabled();

    await getTradesPaginationNext(page).click();

    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[10])),
    ).toBeVisible();
    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[11])),
    ).toBeVisible();
    await expect(getTradesPaginationPrev(page)).toBeEnabled();
    await expect(getTradesPaginationNext(page)).toBeDisabled();

    await getTradesPaginationPrev(page).click();

    await expect(
      page.getByTestId(getTradeRowTestId("AAPL", VIEWER_MATCH_DATES[0])),
    ).toBeVisible();
    await expect(getTradesPaginationPrev(page)).toBeDisabled();
  });
});
