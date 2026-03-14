import { defineConfig, devices } from "@playwright/test";
import { PLAYWRIGHT_AUTH_FILE, getBaseUrl } from "./tests/e2e/helpers/env";

export default defineConfig({
  globalSetup: "./tests/e2e/setup/global.setup.ts",
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    baseURL: getBaseUrl(),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: undefined,
      },
    },
    {
      name: "chromium-smoke",
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: PLAYWRIGHT_AUTH_FILE,
      },
    },
  ],
});
