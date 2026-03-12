import { expect, test } from "@playwright/test";

test("authenticated app shell renders primary navigation", async ({ page }) => {
  await page.goto("/campaigns");

  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Trades" })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Campaigns" })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Trade Plans" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Positions" })).toBeVisible();
  await expect(page.getByTestId("open-command-palette-desktop")).toBeVisible();
});
