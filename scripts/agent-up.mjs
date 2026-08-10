import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  deriveAgentEnvironment,
  getProjectRoot,
  parseDotenv,
  readLocalConvexConfig,
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
const SUPPORTED_CONVEX_CLI_VERSION = "1.43.0";
const environment = deriveAgentEnvironment();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function ensureDependencies() {
  if (fs.existsSync(path.join(PROJECT_ROOT, "node_modules", "convex"))) {
  } else {
    console.log("Installing worktree dependencies...");
    run("pnpm", ["install"]);
  }

  const installedConvexVersion = JSON.parse(
    fs.readFileSync(
      path.join(PROJECT_ROOT, "node_modules", "convex", "package.json"),
      "utf8",
    ),
  ).version;
  if (installedConvexVersion !== SUPPORTED_CONVEX_CLI_VERSION) {
    throw new Error(
      `pnpm agent:up requires convex ${SUPPORTED_CONVEX_CLI_VERSION} because deterministic local-port flags are CLI-version-specific; found ${installedConvexVersion}. Validate the local CLI contract before updating this pin.`,
    );
  }
}

function withoutConvexSelectors(source) {
  const sanitized = { ...source };
  delete sanitized.CONVEX_DEPLOYMENT;
  delete sanitized.CONVEX_DEPLOY_KEY;
  delete sanitized.CONVEX_SELF_HOSTED_ADMIN_KEY;
  delete sanitized.CONVEX_SELF_HOSTED_URL;
  return sanitized;
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
    .map((worktree) => path.join(worktree, ".env.local"))
    .filter((candidate) => fs.existsSync(candidate));

  return (
    candidates.find((candidate) => {
      const source = parseDotenv(fs.readFileSync(candidate, "utf8"));
      return !source.CONVEX_DEPLOYMENT?.startsWith("local:");
    }) ??
    candidates[0] ??
    null
  );
}

function readLocalEnv() {
  if (!fs.existsSync(DOTENV_LOCAL_PATH)) {
    return {};
  }
  return parseDotenv(fs.readFileSync(DOTENV_LOCAL_PATH, "utf8"));
}

function ensureLocalDeploymentSelected() {
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

  const hasLocalConfig = fs.existsSync(LOCAL_CONFIG_PATH);
  const existingEnvironment = readLocalEnv();
  if (
    hasLocalConfig &&
    existingEnvironment.CONVEX_DEPLOYMENT?.startsWith("local:")
  ) {
    updateDotenvFile(DOTENV_LOCAL_PATH, {
      CONVEX_DEPLOY_KEY: null,
      CONVEX_SELF_HOSTED_ADMIN_KEY: null,
      CONVEX_SELF_HOSTED_URL: null,
    });
    return;
  }

  updateDotenvFile(DOTENV_LOCAL_PATH, {
    ...(hasLocalConfig ? { CONVEX_DEPLOYMENT: null } : {}),
    CONVEX_DEPLOY_KEY: null,
    CONVEX_SELF_HOSTED_ADMIN_KEY: null,
    CONVEX_SELF_HOSTED_URL: null,
  });

  const convexEnvironment = withoutConvexSelectors(process.env);
  if (hasLocalConfig) {
    console.log(
      "Selecting this worktree's existing local Convex deployment...",
    );
    run("pnpm", ["exec", "convex", "deployment", "select", "local"], {
      env: convexEnvironment,
    });
  } else {
    console.log("Creating this worktree's isolated local Convex deployment...");
    run(
      "pnpm",
      ["exec", "convex", "deployment", "create", "local", "--select"],
      { env: convexEnvironment },
    );
  }

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

function processStartIdentity(pid) {
  if (!processIsRunning(pid)) {
    return null;
  }
  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
  });
  const identity = result.status === 0 ? result.stdout.trim() : "";
  return identity.length > 0 ? identity : null;
}

function processMatches(pid, expectedStartIdentity) {
  return (
    typeof expectedStartIdentity === "string" &&
    expectedStartIdentity.length > 0 &&
    processStartIdentity(pid) === expectedStartIdentity
  );
}

function portIsListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function occupiedAgentPorts() {
  const ports = [
    environment.appPort,
    environment.convexCloudPort,
    environment.convexSitePort,
  ];
  const states = await Promise.all(
    ports.map(async (port) =>
      (
        await Promise.all([
          portIsListening(port, "127.0.0.1"),
          portIsListening(port, "::1"),
        ])
      ).some(Boolean),
    ),
  );
  return ports.filter((_, index) => states[index]);
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

function convexFunctionsAreReady() {
  try {
    const localConfig = readLocalConvexConfig(LOCAL_CONFIG_PATH);
    if (
      localConfig.cloudPort !== environment.convexCloudPort ||
      typeof localConfig.adminKey !== "string"
    ) {
      return false;
    }
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "convex",
        "function-spec",
        "--url",
        environment.convexUrl,
        "--admin-key",
        localConfig.adminKey,
      ],
      {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        env: withoutConvexSelectors(process.env),
        timeout: 5_000,
      },
    );
    return (
      result.status === 0 &&
      result.stdout.includes('"e2eSeed.js:resetPlaywrightData"')
    );
  } catch {
    return false;
  }
}

async function environmentIsReady() {
  return (await endpointsAreReady()) && convexFunctionsAreReady();
}

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8"));
  } catch {
    return null;
  }
}

function runtimeChildren(runtime) {
  if (Array.isArray(runtime?.children)) {
    return runtime.children;
  }
  return runtime?.childPid
    ? [
        {
          label: "agent environment",
          pid: runtime.childPid,
          startIdentity: runtime.childStartIdentity,
        },
      ]
    : [];
}

function printEnvironment() {
  console.log("\nAgent environment ready");
  console.log(`App origin: ${environment.origin}`);
  console.log(`Convex URL: ${environment.convexUrl}`);
  console.log(`Playwright auth state: ${environment.authFile}\n`);
}

async function waitForExistingRuntime(runtime) {
  const deadline = Date.now() + 180_000;
  while (
    Date.now() < deadline &&
    processMatches(runtime.pid, runtime.supervisorStartIdentity)
  ) {
    const currentRuntime = readRuntime();
    if (
      currentRuntime &&
      runtimeChildren(currentRuntime).length === 2 &&
      runtimeChildren(currentRuntime).every((child) =>
        processMatches(child.pid, child.startIdentity),
      ) &&
      (await environmentIsReady())
    ) {
      printEnvironment();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function writeRuntime() {
  const supervisorStartIdentity = processStartIdentity(process.pid);
  if (!supervisorStartIdentity) {
    throw new Error("Could not identify the agent environment supervisor.");
  }
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  const descriptor = fs.openSync(RUNTIME_PATH, "wx", 0o600);
  fs.writeFileSync(
    descriptor,
    JSON.stringify(
      {
        ...environment,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        supervisorStartIdentity,
      },
      null,
      2,
    ),
  );
  fs.closeSync(descriptor);
}

function updateOwnedRuntime(updates) {
  const runtime = readRuntime();
  if (runtime?.pid !== process.pid) {
    throw new Error(`Lost ownership of ${RUNTIME_PATH}.`);
  }
  fs.writeFileSync(
    RUNTIME_PATH,
    JSON.stringify({ ...runtime, ...updates }, null, 2),
    { mode: 0o600 },
  );
}

function signalChildProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    process.kill(pid, signal);
  }
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopChildProcessGroup(pid) {
  signalChildProcessGroup(pid, "SIGTERM");
  const gracefulDeadline = Date.now() + 5_000;
  while (Date.now() < gracefulDeadline && processGroupExists(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (processGroupExists(pid)) {
    signalChildProcessGroup(pid, "SIGKILL");
  }
  const forcedDeadline = Date.now() + 5_000;
  while (Date.now() < forcedDeadline && processGroupExists(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !processGroupExists(pid);
}

async function waitForProcessExit(pid, startIdentity, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && processMatches(pid, startIdentity)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !processMatches(pid, startIdentity);
}

async function stopRecordedRuntime(runtime) {
  if (runtime.identityHash !== environment.identityHash) {
    throw new Error(
      `${RUNTIME_PATH} belongs to a different worktree. Refusing to stop any process.`,
    );
  }

  if (processMatches(runtime.pid, runtime.supervisorStartIdentity)) {
    process.kill(runtime.pid, "SIGTERM");
    await waitForProcessExit(runtime.pid, runtime.supervisorStartIdentity);
  }
  for (const child of runtimeChildren(runtime)) {
    if (
      processMatches(child.pid, child.startIdentity) &&
      !(await stopChildProcessGroup(child.pid))
    ) {
      throw new Error(
        `Could not stop the recorded ${child.label} process group in ${RUNTIME_PATH}.`,
      );
    }
  }
  if (
    processMatches(runtime.pid, runtime.supervisorStartIdentity) ||
    runtimeChildren(runtime).some((child) =>
      processMatches(child.pid, child.startIdentity),
    )
  ) {
    throw new Error(
      `Could not stop the processes recorded in ${RUNTIME_PATH}; stop them manually before deleting the lease.`,
    );
  }

  fs.rmSync(RUNTIME_PATH, { force: true });
}

async function recoverStaleRuntime(runtime) {
  if (processMatches(runtime.pid, runtime.supervisorStartIdentity)) {
    return false;
  }

  console.log(`Recovering stale agent lease: ${RUNTIME_PATH}`);
  await stopRecordedRuntime(runtime);
  return true;
}

function removeOwnedRuntime() {
  const runtime = readRuntime();
  if (
    runtime?.pid === process.pid &&
    !runtimeChildren(runtime).some((child) =>
      processMatches(child.pid, child.startIdentity),
    )
  ) {
    fs.rmSync(RUNTIME_PATH, { force: true });
  }
}

async function main() {
  if (process.argv.includes("--down")) {
    const runtime = readRuntime();
    if (!runtime) {
      console.log(
        "No recorded agent environment is running for this worktree.",
      );
      return;
    }
    await stopRecordedRuntime(runtime);
    console.log("Agent environment stopped.");
    return;
  }

  const existingRuntime = readRuntime();
  if (
    existingRuntime?.identityHash === environment.identityHash &&
    processMatches(existingRuntime.pid, existingRuntime.supervisorStartIdentity)
  ) {
    if (await waitForExistingRuntime(existingRuntime)) {
      return;
    }
    throw new Error(
      `This worktree's agent environment process is running but did not become ready. Run pnpm agent:down, then rerun pnpm agent:up. Lease: ${RUNTIME_PATH}`,
    );
  }
  if (existingRuntime) {
    await recoverStaleRuntime(existingRuntime);
  }

  const occupiedPorts = await occupiedAgentPorts();
  if (occupiedPorts.length > 0) {
    throw new Error(
      `Refusing to start: another process owns this worktree's deterministic port(s): ${occupiedPorts.join(", ")}. If this worktree was interrupted, run pnpm agent:down; otherwise stop the conflicting worktree or process and rerun pnpm agent:up.`,
    );
  }

  try {
    writeRuntime();
  } catch (error) {
    if (error?.code === "EEXIST") {
      const runtime = readRuntime();
      if (
        runtime &&
        processMatches(runtime.pid, runtime.supervisorStartIdentity) &&
        (await waitForExistingRuntime(runtime))
      ) {
        return;
      }
    }
    throw error;
  }

  ensureDependencies();
  ensureLocalDeploymentSelected();
  updateDotenvFile(DOTENV_LOCAL_PATH, {
    APP_URL: environment.origin,
    CONVEX_DEPLOY_KEY: null,
    CONVEX_SELF_HOSTED_ADMIN_KEY: null,
    CONVEX_SELF_HOSTED_URL: null,
    NEXT_PUBLIC_CONVEX_SITE_URL: environment.convexSiteUrl,
    NEXT_PUBLIC_CONVEX_URL: environment.convexUrl,
    PLAYWRIGHT_AUTH_FILE: path.relative(PROJECT_ROOT, environment.authFile),
    PLAYWRIGHT_BASE_URL: environment.origin,
  });

  const childEnvironment = {
    ...withoutConvexSelectors(process.env),
    APP_URL: environment.origin,
    NEXT_PUBLIC_CONVEX_SITE_URL: environment.convexSiteUrl,
    NEXT_PUBLIC_CONVEX_URL: environment.convexUrl,
    PLAYWRIGHT_BASE_URL: environment.origin,
  };
  const convexChild = spawn(
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
    ],
    {
      cwd: PROJECT_ROOT,
      env: childEnvironment,
      detached: true,
      stdio: "inherit",
    },
  );
  const nextChild = spawn(
    "pnpm",
    [
      "exec",
      "next",
      "dev",
      "--hostname",
      "localhost",
      "--port",
      String(environment.appPort),
    ],
    {
      cwd: PROJECT_ROOT,
      env: childEnvironment,
      detached: true,
      stdio: "inherit",
    },
  );
  const children = [
    { child: convexChild, label: "Convex" },
    { child: nextChild, label: "Next.js" },
  ];
  const childRecords = children.map(({ child, label }) => ({
    label,
    pid: child.pid,
    startIdentity: processStartIdentity(child.pid),
  }));
  if (childRecords.some((child) => !child.startIdentity)) {
    for (const { child } of children) {
      signalChildProcessGroup(child.pid, "SIGTERM");
    }
    throw new Error(
      "Could not identify the started agent environment processes.",
    );
  }
  updateOwnedRuntime({ children: childRecords });

  const exitPromises = children.map(
    ({ child, label }) =>
      new Promise((resolve) => {
        child.once("exit", (code) => resolve({ code: code ?? 1, label }));
      }),
  );

  let stopping = false;
  let externallyStopped = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    for (const { child } of children) {
      signalChildProcessGroup(child.pid, signal);
    }
    setTimeout(() => {
      for (const { child } of children) {
        if (processGroupExists(child.pid)) {
          signalChildProcessGroup(child.pid, "SIGKILL");
        }
      }
    }, 5_000);
  };
  process.on("SIGINT", () => {
    externallyStopped = true;
    stop("SIGINT");
  });
  process.on("SIGTERM", () => {
    externallyStopped = true;
    stop("SIGTERM");
  });

  const readyDeadline = Date.now() + 60_000;
  let ready = false;
  while (
    Date.now() < readyDeadline &&
    children.every(({ child }) => child.exitCode === null)
  ) {
    if (await environmentIsReady()) {
      ready = children.every(({ child }) => child.exitCode === null);
      if (!ready) {
        break;
      }
      printEnvironment();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    stop("SIGTERM");
    const exitedChild = children.find(({ child }) => child.exitCode !== null);
    throw new Error(
      !exitedChild
        ? "Agent environment did not become ready within 60 seconds."
        : `${exitedChild.label} exited with code ${exitedChild.child.exitCode} before the agent environment became ready.`,
    );
  }

  const firstExit = await Promise.race(exitPromises);
  stop("SIGTERM");
  await Promise.all(exitPromises);
  removeOwnedRuntime();
  process.exitCode = externallyStopped ? 0 : firstExit.code || 1;
}

main().catch((error) => {
  removeOwnedRuntime();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
