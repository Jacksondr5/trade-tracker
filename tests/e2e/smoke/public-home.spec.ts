import { expect, test } from "@playwright/test";
import { getBypassBootstrapUrl, getBypassHeaders } from "../helpers/env";

test("public home shows the signed-out landing state", async ({ page }) => {
  const bypassHeaders = getBypassHeaders();
  const bypassBootstrapUrl = getBypassBootstrapUrl();

  if (bypassHeaders && bypassBootstrapUrl) {
    await page.request.get(bypassBootstrapUrl, {
      failOnStatusCode: true,
      headers: bypassHeaders,
    });
  }

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Document your trades with a calmer workflow\./i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
});
