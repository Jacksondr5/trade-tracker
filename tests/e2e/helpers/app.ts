import { expect, type Page } from "@playwright/test";

export async function waitForAuthenticatedApp(
  page: Page,
  pageTitleTestId: string,
) {
  await expect(page.getByTestId(pageTitleTestId)).toBeVisible({
    timeout: 15_000,
  });
}
