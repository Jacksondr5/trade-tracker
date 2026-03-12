import { clerkSetup } from "@clerk/testing/playwright";
import { getClerkTestingConfig } from "../helpers/env";

async function globalSetup() {
  await clerkSetup(getClerkTestingConfig());
}

export default globalSetup;
