import { clerkSetup } from "@clerk/testing/playwright";
import { getClerkTestingConfig } from "../helpers/env";
import { setupPlaywrightFixtureState } from "../helpers/fixtures";

import type { FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  await clerkSetup(getClerkTestingConfig());
  const baseUrl = config.projects[0]?.use?.baseURL;

  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new Error("Playwright baseURL is required during global setup.");
  }

  setupPlaywrightFixtureState(baseUrl);
}

export default globalSetup;
