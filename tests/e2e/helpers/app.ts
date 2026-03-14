import { expect, type Page } from "@playwright/test";

export async function waitForAuthenticatedApp(page: Page, heading: string) {
  await expect(page.getByText("Loading...", { exact: true })).toBeHidden({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({
    timeout: 15_000,
  });
}
