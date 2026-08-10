import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import { runConvexFunction } from "../helpers/convex";
import { getConfiguredBaseUrl, isLocalPlaywrightTarget } from "../helpers/env";
import {
  APP_PAGE_TITLES,
  getBrokerageConnectionConfigureButton,
  getBrokerageConnectionExpectedAccountIdsClearButton,
  getBrokerageConnectionExpectedAccountIdsTextarea,
  getBrokerageConnectionExpectedAccountIdsUndoButton,
  getBrokerageConnectionForm,
  getBrokerageConnectionLabelClearButton,
  getBrokerageConnectionLabelInput,
  getBrokerageConnectionLabelUndoButton,
  getBrokerageConnectionQueryIdInput,
  getBrokerageConnectionReplaceTokenButton,
  getBrokerageConnectionSaveButton,
  getBrokerageConnectionTokenInput,
  getBrokerageConnectionTokenExpiryInput,
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

  test("imports page renders its operational controls and resets an unsaved password draft", async ({
    page,
  }) => {
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
    await tokenInput.fill("unsaved-local-token-draft");

    await getBrokerageConnectionConfigureButton(page).click();
    await expect(connectionForm).toBeHidden();
    await getBrokerageConnectionConfigureButton(page).click();
    await expect(connectionForm).toBeVisible();
    if (await replaceTokenButton.isVisible()) {
      await replaceTokenButton.click();
    }
    await expect(tokenInput).toHaveValue("");
  });

  test("IBKR metadata fields stage independent Clear and Undo actions", async ({
    page,
  }) => {
    const configuredBaseUrl = getConfiguredBaseUrl();
    test.skip(
      !configuredBaseUrl || !isLocalPlaywrightTarget(configuredBaseUrl),
      "Deterministic brokerage metadata is only seeded for local E2E targets.",
    );

    await page.goto("/imports");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.imports);

    const labelInput = getBrokerageConnectionLabelInput(page);
    const expectedAccountIdsTextarea =
      getBrokerageConnectionExpectedAccountIdsTextarea(page);
    const saveButton = getBrokerageConnectionSaveButton(page);
    await expect(labelInput).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.label,
    );
    await expect(expectedAccountIdsTextarea).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.expectedAccountIds.join(", "),
    );

    await labelInput.fill("");
    await expect(saveButton).toBeDisabled();
    await getBrokerageConnectionLabelClearButton(page).click();
    await expect(labelInput).toBeDisabled();
    await expect(labelInput).toHaveValue("");
    await expect(getBrokerageConnectionLabelUndoButton(page)).toBeVisible();
    await expect(saveButton).toBeEnabled();

    await getBrokerageConnectionExpectedAccountIdsClearButton(page).click();
    await expect(expectedAccountIdsTextarea).toBeDisabled();
    await expect(expectedAccountIdsTextarea).toHaveValue("");
    await expect(
      getBrokerageConnectionExpectedAccountIdsUndoButton(page),
    ).toBeVisible();
    await expect(saveButton).toBeEnabled();

    await getBrokerageConnectionLabelUndoButton(page).click();
    await getBrokerageConnectionExpectedAccountIdsUndoButton(page).click();
    await expect(labelInput).toBeEnabled();
    await expect(labelInput).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.label,
    );
    await expect(expectedAccountIdsTextarea).toBeEnabled();
    await expect(expectedAccountIdsTextarea).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.expectedAccountIds.join(", "),
    );
    await expect(expectedAccountIdsTextarea).toHaveJSProperty(
      "tagName",
      "TEXTAREA",
    );
    await expectedAccountIdsTextarea.fill(
      E2E_SMOKE_FIXTURES.brokerageConnection.expectedAccountIds.join("\n"),
    );
    await expect(saveButton).toBeEnabled();
    await expect(expectedAccountIdsTextarea).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.expectedAccountIds.join("\n"),
    );
    await getBrokerageConnectionConfigureButton(page).click();
    await expect(getBrokerageConnectionForm(page)).toBeHidden();
    await getBrokerageConnectionConfigureButton(page).click();
    await expect(getBrokerageConnectionForm(page)).toBeVisible();
    await expect(
      getBrokerageConnectionExpectedAccountIdsTextarea(page),
    ).toHaveValue(
      E2E_SMOKE_FIXTURES.brokerageConnection.expectedAccountIds.join(", "),
    );
  });

  test("first-time IBKR setup allows Expected account IDs and Label to remain unset", async ({
    page,
  }) => {
    const configuredBaseUrl = getConfiguredBaseUrl();
    test.skip(
      !configuredBaseUrl || !isLocalPlaywrightTarget(configuredBaseUrl),
      "Deterministic brokerage metadata is only seeded for local E2E targets.",
    );

    runConvexFunction("e2eSeed:setBrokerageConnectionMetadataFixture", {
      state: "unset",
    });
    try {
      await page.goto("/imports");
      await waitForAuthenticatedApp(page, APP_PAGE_TITLES.imports);

      await expect(getBrokerageConnectionLabelInput(page)).toHaveValue("");
      await expect(
        getBrokerageConnectionExpectedAccountIdsTextarea(page),
      ).toHaveValue("");
      await expect(getBrokerageConnectionLabelClearButton(page)).toHaveCount(0);
      await expect(
        getBrokerageConnectionExpectedAccountIdsClearButton(page),
      ).toHaveCount(0);
      await expect(getBrokerageConnectionTokenExpiryInput(page)).toHaveValue(
        "",
      );
      await getBrokerageConnectionTokenExpiryInput(page).fill("2027-12-31");
      await getBrokerageConnectionTokenInput(page).fill(
        "unsaved-first-setup-token-draft",
      );
      await expect(getBrokerageConnectionSaveButton(page)).toBeEnabled();
    } finally {
      runConvexFunction("e2eSeed:setBrokerageConnectionMetadataFixture", {
        state: "persisted",
      });
    }
  });
});
