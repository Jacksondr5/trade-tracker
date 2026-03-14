import { clerkSetup } from "@clerk/testing/playwright";
import { getClerkTestingConfig } from "../helpers/env";
import { setupPlaywrightFixtureState } from "../helpers/fixtures";

async function globalSetup() {
  await clerkSetup(getClerkTestingConfig());
  setupPlaywrightFixtureState();
}

export default globalSetup;
