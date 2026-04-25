import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  BRAVOS_REVIEW_TEST_IDS,
} from "../../../shared/e2e/testIds";

test.describe("Bravos review workspace", () => {
  test("Bravos review route renders connection state and pending items", async ({
    page,
  }) => {
    await page.goto("/imports/bravos");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.importsBravos);
    await expect(page.getByTestId(BRAVOS_REVIEW_TEST_IDS.syncCard)).toBeVisible();
    await expect(page.getByTestId(BRAVOS_REVIEW_TEST_IDS.list)).toBeVisible();
  });
});
