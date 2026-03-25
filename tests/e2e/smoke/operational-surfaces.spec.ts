import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getTradesFilteredEmptyState,
  getTradePlansFilteredEmptyState,
  getLinkedTradeRow,
} from "../helpers/selectors";

test.describe("operational surfaces regression", () => {
  test("trades page renders with correct structure after palette alignment", async ({
    page,
  }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    // Verify the trades table renders with at least one trade row
    await expect(getLinkedTradeRow(page)).toBeVisible();

    // Verify filter controls are present and use shared Select
    await expect(page.getByTestId("trades-filter-portfolio")).toBeVisible();
    await expect(page.getByTestId("trades-filter-account")).toBeVisible();
    await expect(page.getByTestId("trades-filter-ticker")).toBeVisible();
    await expect(page.getByTestId("trades-filter-start-date")).toBeVisible();
    await expect(page.getByTestId("trades-filter-end-date")).toBeVisible();

    // Verify pagination controls are present
    await expect(page.getByTestId("trades-page-size-select")).toBeVisible();
  });

  test("trades filtered-empty state appears for non-matching ticker", async ({
    page,
  }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    // Enter a ticker that does not exist in seeded data
    await page.getByTestId("trades-filter-ticker").fill("ZZZZZZZ");

    // Wait for debounce and verify filtered empty state
    await expect(getTradesFilteredEmptyState(page)).toBeVisible();
  });

  test("trade plans filtered-empty state appears for non-matching filter combination", async ({
    page,
  }) => {
    await page.goto("/trade-plans");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

    // Combine "Bravos" relationship + "Closed" status filters.
    // No e2e test creates then closes a Bravos plan, so this
    // reliably produces zero results on both local and preview targets.
    await page.getByTestId("trade-plans-filter-bravos").click();
    await page.getByTestId("trade-plans-status-closed").click();

    // Verify the filtered empty state is displayed
    await expect(getTradePlansFilteredEmptyState(page)).toBeVisible();
  });

  test("imports page renders with correct structure", async ({ page }) => {
    await page.goto("/imports");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.imports);

    // Verify the brokerage select uses shared Select component
    await expect(page.getByTestId("brokerage-select")).toBeVisible();
  });
});
