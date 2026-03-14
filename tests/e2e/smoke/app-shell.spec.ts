import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";

test("authenticated users are redirected from the entry page to dashboard", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/dashboard$/);
  await waitForAuthenticatedApp(page, "Dashboard");
});

test("authenticated app shell renders primary navigation", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, "Campaigns");

  await expect(page.getByRole("link", { exact: true, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Trades" })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Campaigns" })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Trade Plans" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Positions" })).toBeVisible();
  await expect(page.getByTestId("open-command-palette-desktop")).toBeVisible();
});
