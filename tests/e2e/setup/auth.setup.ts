import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { PLAYWRIGHT_AUTH_FILE, getPlaywrightCredentials } from "../helpers/env";

setup("authenticate test user @auth-setup", async ({ page }) => {
  const credentials = getPlaywrightCredentials();

  await page.goto("/");
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
  await page.context().storageState({ path: PLAYWRIGHT_AUTH_FILE });
});
