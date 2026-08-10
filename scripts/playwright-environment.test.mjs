import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  getAuthFileForBaseUrl,
  getPlaywrightAuthFile,
  getProjectRoot,
} from "../tests/e2e/helpers/env.ts";

const originalEnvironment = {
  APP_URL: process.env.APP_URL,
  PLAYWRIGHT_AUTH_FILE: process.env.PLAYWRIGHT_AUTH_FILE,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("Playwright auth state must match the complete configured origin", () => {
  const baseUrl = "http://localhost:17890";
  const expected = getAuthFileForBaseUrl(baseUrl);
  process.env.PLAYWRIGHT_BASE_URL = baseUrl;
  process.env.PLAYWRIGHT_AUTH_FILE = path.relative(getProjectRoot(), expected);

  expect(getPlaywrightAuthFile()).toBe(expected);

  process.env.PLAYWRIGHT_AUTH_FILE = "output/playwright/auth/wrong.json";
  expect(() => getPlaywrightAuthFile()).toThrow(
    "PLAYWRIGHT_AUTH_FILE must match the configured app origin",
  );
});
