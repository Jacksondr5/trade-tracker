import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES } from "../../../shared/e2e/testIds";

test.describe("deactivated Bravos review workspace", () => {
  test("redirects the legacy review route to imports", async ({ page }) => {
    await page.goto("/imports/bravos");
    await expect(page).toHaveURL(/\/imports$/);
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.imports);
  });
});
