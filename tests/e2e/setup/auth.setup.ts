import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  PLAYWRIGHT_AUTH_FILE,
  getBypassBootstrapUrl,
  getBypassHeaders,
  getPlaywrightCredentials,
} from "../helpers/env";

setup("authenticate test user @auth-setup", async ({ page }) => {
  const credentials = getPlaywrightCredentials();
  const bypassHeaders = getBypassHeaders();
  const bypassBootstrapUrl = getBypassBootstrapUrl();

  if (bypassHeaders && bypassBootstrapUrl) {
    const bypassResponse = await page.request.get(bypassBootstrapUrl, {
      failOnStatusCode: false,
      headers: bypassHeaders,
    });

    if (!bypassResponse.ok()) {
      throw new Error(
        `Failed to establish Vercel preview bypass cookie: ${bypassResponse.status()} ${bypassResponse.statusText()}`,
      );
    }
  }

  await page.goto("/sign-in");
  await clerk.loaded({ page });
  await clerk.signIn({
    page,
    signInParams: {
      identifier: credentials.username,
      password: credentials.password,
      strategy: "password",
    },
  });
  await page.goto("/campaigns");

  fs.mkdirSync(path.dirname(PLAYWRIGHT_AUTH_FILE), { recursive: true });
  await page.waitForURL(/\/campaigns(?:\/.*)?$/);
  await waitForAuthenticatedApp(page, "Campaigns");
  await page.context().storageState({ path: PLAYWRIGHT_AUTH_FILE });
});
