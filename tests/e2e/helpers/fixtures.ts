import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readLocalConvexConfig } from "../../../scripts/agent-environment.mjs";
import {
  PLAYWRIGHT_ENV_FILE,
  getProjectRoot,
  isLocalPlaywrightTarget,
  loadDotenvLocal,
} from "./env";

type LocalConvexTarget = { adminKey: string; url: string };

export function assertIsolatedAgentDeployment(
  baseUrl: string,
): LocalConvexTarget | null {
  if (!isLocalPlaywrightTarget(baseUrl)) {
    return null;
  }

  if (!fs.existsSync(PLAYWRIGHT_ENV_FILE)) {
    throw new Error(
      "Refusing to reset Playwright data: .env.local is missing. Start the isolated environment with pnpm agent:up.",
    );
  }
  const localEnvironment = loadDotenvLocal();
  const deployment = localEnvironment.CONVEX_DEPLOYMENT;
  const convexUrl = localEnvironment.NEXT_PUBLIC_CONVEX_URL;
  const localConfigPath = path.join(
    getProjectRoot(),
    ".convex",
    "local",
    "default",
    "config.json",
  );
  if (!deployment?.startsWith("local:") || !fs.existsSync(localConfigPath)) {
    throw new Error(
      "Refusing to reset Playwright data: the configured Convex deployment is not an isolated worktree-local backend. Run pnpm agent:up.",
    );
  }

  let localConfig: { adminKey: string; cloudPort: number };
  try {
    localConfig = readLocalConvexConfig(localConfigPath);
  } catch {
    throw new Error(
      "Refusing to reset Playwright data: this worktree's local Convex config is unreadable. Run pnpm agent:up.",
    );
  }
  const localCloudPort = localConfig.cloudPort;
  let configuredConvexPort: number | null = null;
  try {
    const parsedConvexUrl = new URL(convexUrl ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(parsedConvexUrl.hostname) ||
      !parsedConvexUrl.port
    ) {
      throw new Error("not local");
    }
    configuredConvexPort = Number(parsedConvexUrl.port);
  } catch {
    throw new Error(
      "Refusing to reset Playwright data: NEXT_PUBLIC_CONVEX_URL is not local.",
    );
  }
  if (configuredConvexPort !== localCloudPort) {
    throw new Error(
      "Refusing to reset Playwright data: .env.local does not match this worktree's local Convex backend.",
    );
  }

  return {
    adminKey: localConfig.adminKey,
    url: `http://127.0.0.1:${localCloudPort}`,
  };
}

function parseConvexRunOutput<T>(output: string): T {
  const trimmed = output.trim();

  if (!trimmed) {
    throw new Error("Convex run returned no output.");
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const candidate of [trimmed, ...lines.slice().reverse()]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to parse Convex run output as JSON:\n${trimmed}`);
}

function runConvexFunction<T>(
  functionName: string,
  target: LocalConvexTarget,
): T {
  // Name the destructive target explicitly. These flags take precedence over
  // deploy keys and selectors loaded from either the process or .env.local.
  const convexEnvironment = { ...process.env };
  delete convexEnvironment.CONVEX_DEPLOYMENT;
  delete convexEnvironment.CONVEX_DEPLOY_KEY;
  delete convexEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY;
  delete convexEnvironment.CONVEX_SELF_HOSTED_URL;
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      "--url",
      target.url,
      "--admin-key",
      target.adminKey,
      functionName,
    ],
    {
      cwd: getProjectRoot(),
      encoding: "utf8",
      env: convexEnvironment,
      timeout: 30_000,
    },
  );

  return parseConvexRunOutput<T>(output);
}

export function setupPlaywrightFixtureState(baseUrl: string): void {
  if (!isLocalPlaywrightTarget(baseUrl)) {
    return;
  }

  const target = assertIsolatedAgentDeployment(baseUrl);
  if (!target) {
    return;
  }
  runConvexFunction("e2eSeed:resetPlaywrightData", target);
  runConvexFunction("e2eSeed:setupPreviewData", target);
}
