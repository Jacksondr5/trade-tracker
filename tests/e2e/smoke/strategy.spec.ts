import { expect, test } from "@playwright/test";
import { STRATEGY_TEST_IDS } from "../../../shared/e2e/testIds";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES, getPageTitle } from "../helpers/selectors";

test("strategy page shows empty state and supports document creation", async ({
  page,
}) => {
  const timestamp = Date.now();
  const strategyContent = `E2E Strategy ${timestamp}`;

  await page.goto("/strategy");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.strategy);
  await expect(getPageTitle(page, "strategy")).toBeVisible();

  const editorLocator = page.getByTestId(STRATEGY_TEST_IDS.editor);
  const emptyStateLocator = page.getByTestId(STRATEGY_TEST_IDS.emptyState);

  await expect(emptyStateLocator).toBeVisible();
  await expect(page.getByTestId(STRATEGY_TEST_IDS.emptyStateCta)).toBeVisible();

  await page.getByTestId(STRATEGY_TEST_IDS.emptyStateCta).click();
  await expect(editorLocator).toBeVisible();

  const proseMirror = page.getByTestId(STRATEGY_TEST_IDS.editorInput);
  await expect(proseMirror).toBeVisible();
  await proseMirror.click();
  await proseMirror.pressSequentially(strategyContent, { delay: 10 });

  // Wait for autosave to complete
  const saveStatus = page.getByTestId(STRATEGY_TEST_IDS.saveStatus);
  await expect(saveStatus).toContainText("Saved", { timeout: 10_000 });

  // Reload and verify persistence
  await page.reload();
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.strategy);
  await expect(editorLocator).toBeVisible();
  await expect(page.getByTestId(STRATEGY_TEST_IDS.editorInput)).toContainText(
    strategyContent,
  );
  await expect(page.getByTestId(STRATEGY_TEST_IDS.lastUpdated)).toBeVisible();
});
