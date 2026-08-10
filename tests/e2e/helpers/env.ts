import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authFileForOrigin,
  parseDotenv,
} from "../../../scripts/agent-environment.mjs";

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error("Could not find project root from tests/e2e/helpers/env.ts");
}

const ROOT_DIR = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_PLAYWRIGHT_HOSTS = new Set(["127.0.0.1", "localhost"]);
const DOTENV_LOCAL_PATH = path.join(ROOT_DIR, ".env.local");

export const PLAYWRIGHT_ENV_FILE = DOTENV_LOCAL_PATH;

export function loadDotenvLocal(): Record<string, string> {
  if (!fs.existsSync(DOTENV_LOCAL_PATH)) {
    return {};
  }

  return parseDotenv(fs.readFileSync(DOTENV_LOCAL_PATH, "utf8"));
}

function normalizeClerkFrontendApiUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function getConfiguredBaseUrl(): string | null {
  const dotenvLocal = loadDotenvLocal();
  const configuredBaseUrl =
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    dotenvLocal.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    dotenvLocal.APP_URL?.trim();

  return configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : null;
}

export function getBaseUrl(): string {
  const configuredBaseUrl = getConfiguredBaseUrl();

  if (!configuredBaseUrl || configuredBaseUrl.length === 0) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL or APP_URL must be set for Playwright runs.",
    );
  }

  return configuredBaseUrl;
}

export function getAuthFileForBaseUrl(baseUrl: string): string {
  return authFileForOrigin(baseUrl, ROOT_DIR);
}

export function getPlaywrightAuthFile(): string {
  const dotenvLocal = loadDotenvLocal();
  const configured =
    process.env.PLAYWRIGHT_AUTH_FILE?.trim() ||
    dotenvLocal.PLAYWRIGHT_AUTH_FILE?.trim();

  return configured
    ? path.resolve(ROOT_DIR, configured)
    : getAuthFileForBaseUrl(getBaseUrl());
}

function shouldUseBypassHeaders(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return !LOCAL_PLAYWRIGHT_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function getProjectRoot(): string {
  return ROOT_DIR;
}

export function isLocalPlaywrightTarget(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return LOCAL_PLAYWRIGHT_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function getBypassHeaders(): Record<string, string> | undefined {
  const dotenvLocal = loadDotenvLocal();
  const bypassSecret = (
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ??
    dotenvLocal.VERCEL_AUTOMATION_BYPASS_SECRET
  )?.trim();

  if (!bypassSecret || !shouldUseBypassHeaders(getBaseUrl())) {
    return undefined;
  }

  return {
    "x-vercel-protection-bypass": bypassSecret,
    "x-vercel-set-bypass-cookie": "samesitenone",
  };
}

export function getBypassBootstrapUrl(): string | undefined {
  const bypassHeaders = getBypassHeaders();

  if (!bypassHeaders) {
    return undefined;
  }

  return new URL("/", getBaseUrl()).toString();
}

function getRequiredEnv(name: string): string {
  const dotenvLocal = loadDotenvLocal();
  const value = (process.env[name] ?? dotenvLocal[name])?.trim();

  if (!value) {
    throw new Error(`${name} is required for Playwright auth setup.`);
  }

  return value;
}

export function getClerkTestingConfig() {
  return {
    frontendApiUrl: normalizeClerkFrontendApiUrl(
      getRequiredEnv("NEXT_PUBLIC_CLERK_FRONTEND_API_URL"),
    ),
    publishableKey: getRequiredEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  };
}

export function getPlaywrightCredentials() {
  return {
    password: getRequiredEnv("PLAYWRIGHT_PASSWORD"),
    username: getRequiredEnv("PLAYWRIGHT_USERNAME"),
  };
}
