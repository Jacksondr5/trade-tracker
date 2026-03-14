import { expect, test } from "@playwright/test";

test("public home shows the signed-out landing state", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Document your trades with a calmer workflow\./i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
});
