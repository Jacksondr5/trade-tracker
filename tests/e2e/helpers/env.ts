import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const PLAYWRIGHT_AUTH_FILE = path.join(
  ROOT_DIR,
  "output",
  "playwright",
  "auth.json",
);

const DOTENV_LOCAL_PATH = path.join(ROOT_DIR, ".env.local");

function loadDotenvLocal(): Record<string, string> {
  if (!fs.existsSync(DOTENV_LOCAL_PATH)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(DOTENV_LOCAL_PATH, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => line.length > 0 && !line.startsWith("#") && line.includes("="),
      )
      .map((line) => {
        const delimiterIndex = line.indexOf("=");
        const key = line.slice(0, delimiterIndex).trim();
        let value = line.slice(delimiterIndex + 1).trim();

        if (
          value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
        ) {
          value = value.slice(1, -1);
        }

        return [key, value];
      }),
  );
}

const dotenvLocal = loadDotenvLocal();

function normalizeClerkFrontendApiUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function getBaseUrl(): string {
  const configuredBaseUrl =
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    dotenvLocal.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    dotenvLocal.APP_URL?.trim();

  return configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : "http://127.0.0.1:3000";
}

function shouldUseBypassHeaders(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname !== "127.0.0.1" && hostname !== "localhost";
  } catch {
    return false;
  }
}

export function getBypassHeaders(): Record<string, string> | undefined {
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
