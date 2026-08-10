import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  PLAYWRIGHT_ENV_FILE,
  getProjectRoot,
  isLocalPlaywrightTarget,
} from "./env";

function readLocalEnvironment(): Record<string, string> {
  return Object.fromEntries(
    fs
      .readFileSync(PLAYWRIGHT_ENV_FILE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith("#") && line.includes("="),
      )
      .map((line) => {
        const delimiterIndex = line.indexOf("=");
        return [
          line.slice(0, delimiterIndex).trim(),
          line
            .slice(delimiterIndex + 1)
            .trim()
            .replace(/^(['"])(.*)\1$/, "$2"),
        ];
      }),
  );
}

export function assertIsolatedAgentDeployment(baseUrl: string): void {
  if (!isLocalPlaywrightTarget(baseUrl)) {
    return;
  }

  if (!fs.existsSync(PLAYWRIGHT_ENV_FILE)) {
    throw new Error(
      "Refusing to reset Playwright data: .env.local is missing. Start the isolated environment with pnpm agent:up.",
    );
  }
  const localEnvironment = readLocalEnvironment();
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

  const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf8")) as {
    ports?: { cloud?: number };
  };
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
  if (configuredConvexPort !== localConfig.ports?.cloud) {
    throw new Error(
      "Refusing to reset Playwright data: .env.local does not match this worktree's local Convex backend.",
    );
  }
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

function runConvexFunction<T>(functionName: string): T {
  // clerkSetup loads .env.local into this process. Convex's local deployment
  // selector must read its worktree metadata from the file itself; passing the
  // `local:` value as an inherited shell variable makes the CLI treat it like a
  // cloud selector. Remove deployment-selection variables before spawning.
  const convexEnvironment = { ...process.env };
  delete convexEnvironment.CONVEX_DEPLOYMENT;
  delete convexEnvironment.CONVEX_DEPLOY_KEY;
  delete convexEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY;
  delete convexEnvironment.CONVEX_SELF_HOSTED_URL;
  const output = execFileSync("pnpm", ["exec", "convex", "run", functionName], {
    cwd: getProjectRoot(),
    encoding: "utf8",
    env: convexEnvironment,
    timeout: 30_000,
  });

  return parseConvexRunOutput<T>(output);
}

export function setupPlaywrightFixtureState(baseUrl: string): void {
  if (!isLocalPlaywrightTarget(baseUrl)) {
    return;
  }

  assertIsolatedAgentDeployment(baseUrl);
  runConvexFunction("e2eSeed:resetPlaywrightData");
  runConvexFunction("e2eSeed:setupPreviewData");
}
