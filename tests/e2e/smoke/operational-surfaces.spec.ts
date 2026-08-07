import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getBrokerageConnectionConfigureButton,
  getBrokerageConnectionForm,
  getBrokerageConnectionQueryIdInput,
  getBrokerageConnectionReplaceTokenButton,
  getBrokerageConnectionTokenInput,
  getBrokerageConnectionTokenStatus,
  getBrokerageLatestFailure,
  getBrokerageLatestSuccess,
  getBrokeragePendingImports,
  getBrokerageReconciliationIssues,
  getBrokerageSelect,
  getBrokerageSyncStatus,
  getLinkedTradeRow,
  getTradePlansFilterStandalone,
  getTradePlansFilteredEmptyState,
  getTradePlansStatusClosed,
  getTradesFilterAccount,
  getTradesFilterEndDate,
  getTradesFilterPortfolio,
  getTradesFilterStartDate,
  getTradesFilterTicker,
  getTradesFilteredEmptyState,
  getTradesPageSizeSelect,
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
    await expect(getTradesFilterPortfolio(page)).toBeVisible();
    await expect(getTradesFilterAccount(page)).toBeVisible();
    await expect(getTradesFilterTicker(page)).toBeVisible();
    await expect(getTradesFilterStartDate(page)).toBeVisible();
    await expect(getTradesFilterEndDate(page)).toBeVisible();

    // Verify pagination controls are present
    await expect(getTradesPageSizeSelect(page)).toBeVisible();
  });

  test("trades filtered-empty state appears for non-matching ticker", async ({
    page,
  }) => {
    await page.goto("/trades");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.trades);

    // Enter a ticker that does not exist in seeded data
    await getTradesFilterTicker(page).fill("ZZZZZZZ");

    // Wait for debounce and verify filtered empty state
    await expect(getTradesFilteredEmptyState(page)).toBeVisible();
  });

  test("trade plans filtered-empty state appears for non-matching filter combination", async ({
    page,
  }) => {
    await page.goto("/trade-plans");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

    // Combine "Standalone" relationship + "Closed" status filters.
    // The deterministic seed has a watching standalone plan but no closed one,
    // reliably produces zero results on both local and preview targets.
    await getTradePlansFilterStandalone(page).click();
    await getTradePlansStatusClosed(page).click();

    // Verify the filtered empty state is displayed
    await expect(getTradePlansFilteredEmptyState(page)).toBeVisible();
  });

  test("imports page renders with correct structure", async ({ page }) => {
    await page.goto("/imports");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.imports);

    // Verify the brokerage select uses shared Select component
    await expect(getBrokerageSelect(page)).toBeVisible();

    await expect(getBrokerageSyncStatus(page)).toBeVisible();
    await expect(getBrokerageLatestSuccess(page)).toBeVisible();
    await expect(getBrokerageLatestFailure(page)).toBeVisible();
    await expect(getBrokeragePendingImports(page)).toBeVisible();
    await expect(getBrokerageReconciliationIssues(page)).toBeVisible();

    const connectionForm = getBrokerageConnectionForm(page);
    const formWasVisible = await connectionForm.isVisible();
    await getBrokerageConnectionConfigureButton(page).click();
    if (formWasVisible) {
      await expect(connectionForm).toBeHidden();
      await getBrokerageConnectionConfigureButton(page).click();
      await expect(connectionForm).toBeVisible();
    } else {
      await expect(connectionForm).toBeVisible();
    }
    await expect(getBrokerageConnectionQueryIdInput(page)).toBeVisible();
    await expect(getBrokerageConnectionTokenStatus(page)).toBeVisible();

    const replaceTokenButton = getBrokerageConnectionReplaceTokenButton(page);
    if (await replaceTokenButton.isVisible()) {
      await replaceTokenButton.click();
    }
    const tokenInput = getBrokerageConnectionTokenInput(page);
    await expect(tokenInput).toBeVisible();
    await expect(tokenInput).toHaveAttribute("type", "password");
    await expect(tokenInput).toHaveValue("");
    await tokenInput.fill("must-not-be-read-back");

    await getBrokerageConnectionConfigureButton(page).click();
    await expect(connectionForm).toBeHidden();
    await getBrokerageConnectionConfigureButton(page).click();
    await expect(connectionForm).toBeVisible();
    if (await replaceTokenButton.isVisible()) {
      await replaceTokenButton.click();
    }
    await expect(tokenInput).toHaveValue("");
  });
});
