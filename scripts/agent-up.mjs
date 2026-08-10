import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  deriveAgentEnvironment,
  getProjectRoot,
  parseDotenv,
  updateDotenvFile,
} from "./agent-environment.mjs";

const PROJECT_ROOT = getProjectRoot();
const DOTENV_LOCAL_PATH = path.join(PROJECT_ROOT, ".env.local");
const LOCAL_CONFIG_PATH = path.join(
  PROJECT_ROOT,
  ".convex",
  "local",
  "default",
  "config.json",
);
const RUNTIME_PATH = path.join(PROJECT_ROOT, "output", "agent", "runtime.json");
const environment = deriveAgentEnvironment();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function ensureDependencies() {
  if (fs.existsSync(path.join(PROJECT_ROOT, "node_modules", "convex"))) {
    return;
  }

  console.log("Installing worktree dependencies...");
  run("pnpm", ["install"]);
}

function findBootstrapEnvFile() {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("Could not enumerate git worktrees for environment setup.");
  }

  const candidates = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((worktree) => path.resolve(worktree) !== PROJECT_ROOT)
    .map((worktree) => path.join(worktree, ".env.local"));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function readLocalEnv() {
  if (!fs.existsSync(DOTENV_LOCAL_PATH)) {
    return {};
  }
  return parseDotenv(fs.readFileSync(DOTENV_LOCAL_PATH, "utf8"));
}

function ensureLocalDeploymentSelected() {
  const currentEnv = readLocalEnv();
  const alreadyLocal =
    currentEnv.CONVEX_DEPLOYMENT?.startsWith("local:") &&
    fs.existsSync(LOCAL_CONFIG_PATH);
  if (alreadyLocal) {
    return;
  }

  if (!fs.existsSync(DOTENV_LOCAL_PATH)) {
    const bootstrapEnvFile = findBootstrapEnvFile();
    if (!bootstrapEnvFile) {
      throw new Error(
        "No worktree-local .env.local exists and no bootstrap source was found. Configure the primary checkout's .env.local, then rerun pnpm agent:up.",
      );
    }
    fs.copyFileSync(bootstrapEnvFile, DOTENV_LOCAL_PATH);
    fs.chmodSync(DOTENV_LOCAL_PATH, 0o600);
  }

  console.log("Selecting an isolated worktree-local Convex deployment...");
  run("pnpm", ["exec", "convex", "deployment", "select", "local"], {
    input: "y\n",
  });

  const selectedEnv = readLocalEnv();
  if (
    !selectedEnv.CONVEX_DEPLOYMENT?.startsWith("local:") ||
    !fs.existsSync(LOCAL_CONFIG_PATH)
  ) {
    throw new Error(
      "Convex did not select a worktree-local deployment. Refusing to start against a shared backend.",
    );
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(1_500) });
  } catch {
    return null;
  }
}

async function endpointsAreReady() {
  const [appResponse, convexResponse] = await Promise.all([
    fetchWithTimeout(environment.origin),
    fetchWithTimeout(`${environment.convexUrl}/instance_name`),
  ]);
  return Boolean(appResponse?.ok && convexResponse?.ok);
}

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8"));
  } catch {
    return null;
  }
}

function printEnvironment() {
  console.log("\nAgent environment ready");
  console.log(`App origin: ${environment.origin}`);
  console.log(`Convex URL: ${environment.convexUrl}`);
  console.log(`Playwright auth state: ${environment.authFile}\n`);
}

async function waitForExistingRuntime(runtime) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && processIsRunning(runtime.pid)) {
    if (await endpointsAreReady()) {
      printEnvironment();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function writeRuntime() {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  const descriptor = fs.openSync(RUNTIME_PATH, "wx", 0o600);
  fs.writeFileSync(
    descriptor,
    JSON.stringify(
      {
        ...environment,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  fs.closeSync(descriptor);
}

function removeOwnedRuntime() {
  const runtime = readRuntime();
  if (runtime?.pid === process.pid) {
    fs.rmSync(RUNTIME_PATH, { force: true });
  }
}

async function main() {
  ensureDependencies();
  ensureLocalDeploymentSelected();
  updateDotenvFile(DOTENV_LOCAL_PATH, {
    APP_URL: environment.origin,
    CONVEX_DEPLOY_KEY: null,
    CONVEX_SELF_HOSTED_ADMIN_KEY: null,
    CONVEX_SELF_HOSTED_URL: null,
    NEXT_PUBLIC_CONVEX_SITE_URL: environment.convexSiteUrl,
    NEXT_PUBLIC_CONVEX_URL: environment.convexUrl,
    PLAYWRIGHT_AUTH_FILE: environment.authFile,
    PLAYWRIGHT_BASE_URL: environment.origin,
  });

  const existingRuntime = readRuntime();
  if (
    existingRuntime?.identityHash === environment.identityHash &&
    processIsRunning(existingRuntime.pid)
  ) {
    if (await waitForExistingRuntime(existingRuntime)) {
      return;
    }
    throw new Error(
      "This worktree's agent environment process is running but did not become ready.",
    );
  }
  if (existingRuntime) {
    fs.rmSync(RUNTIME_PATH, { force: true });
  }

  try {
    writeRuntime();
  } catch (error) {
    if (error?.code === "EEXIST") {
      const runtime = readRuntime();
      if (runtime && (await waitForExistingRuntime(runtime))) {
        return;
      }
    }
    throw error;
  }

  const child = spawn(
    "pnpm",
    [
      "exec",
      "convex",
      "dev",
      "--local-cloud-port",
      String(environment.convexCloudPort),
      "--local-site-port",
      String(environment.convexSitePort),
      "--tail-logs",
      "disable",
      "--start",
      `pnpm exec next dev --hostname localhost --port ${environment.appPort}`,
    ],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        APP_URL: environment.origin,
        NEXT_PUBLIC_CONVEX_SITE_URL: environment.convexSiteUrl,
        NEXT_PUBLIC_CONVEX_URL: environment.convexUrl,
        PLAYWRIGHT_BASE_URL: environment.origin,
      },
      stdio: "inherit",
    },
  );

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const readyDeadline = Date.now() + 60_000;
  while (Date.now() < readyDeadline && child.exitCode === null) {
    if (await endpointsAreReady()) {
      printEnvironment();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!(await endpointsAreReady())) {
    stop("SIGTERM");
    throw new Error(
      "Agent environment did not become ready within 60 seconds.",
    );
  }

  const exitCode = await new Promise((resolve) => {
    child.once("exit", (code) => resolve(code ?? 1));
  });
  removeOwnedRuntime();
  process.exitCode = stopping ? 0 : exitCode;
}

main().catch((error) => {
  removeOwnedRuntime();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
