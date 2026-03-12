import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test as setup } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { PLAYWRIGHT_AUTH_FILE, getPlaywrightCredentials } from "../helpers/env";

type StoredOrigin = {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
};

async function loadSavedAuthState(page: Page): Promise<void> {
  const resolvedAuthFile = path.resolve(PLAYWRIGHT_AUTH_FILE);

  if (!fs.existsSync(resolvedAuthFile)) {
    return;
  }

  let storageState: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Strict" | "Lax" | "None";
    }>;
    origins?: StoredOrigin[];
  };

  try {
    storageState = JSON.parse(fs.readFileSync(resolvedAuthFile, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Failed to parse Playwright auth state file ${resolvedAuthFile}: ${message}`,
    );
    return;
  }

  if (storageState.cookies && storageState.cookies.length > 0) {
    await page.context().addCookies(storageState.cookies);
  }

  if (storageState.origins && storageState.origins.length > 0) {
    await page.context().addInitScript((origins: StoredOrigin[]) => {
      const activeOrigin = window.location.origin;
      const matchingOrigin = origins.find((origin) => origin.origin === activeOrigin);

      if (!matchingOrigin) {
        return;
      }

      for (const entry of matchingOrigin.localStorage) {
        window.localStorage.setItem(entry.name, entry.value);
      }
    }, storageState.origins);
  }
}

setup("authenticate test user @auth-setup", async ({ page }) => {
  const credentials = getPlaywrightCredentials();

  await loadSavedAuthState(page);

  await page.goto("/campaigns");

  if (page.url().includes("/sign-in")) {
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
  }

  fs.mkdirSync(path.dirname(PLAYWRIGHT_AUTH_FILE), { recursive: true });
  await page.waitForURL(/\/campaigns(?:\/.*)?$/);
  await page.context().storageState({ path: PLAYWRIGHT_AUTH_FILE });
});
