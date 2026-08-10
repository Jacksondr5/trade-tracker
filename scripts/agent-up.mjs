import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  classifyAgentRuntime,
  deriveAgentEnvironment,
  formatAgentAge,
  getProjectRoot,
  getWorktreePresence,
  parseDotenv,
  readLocalConvexConfig,
  shouldReapAgentRuntime,
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
const LEGACY_RUNTIME_PATH = path.join(
  PROJECT_ROOT,
  "output",
  "agent",
  "runtime.json",
);
const SUPPORTED_CONVEX_CLI_VERSION = "1.43.0";
const FUNCTION_SPEC_RETRY_MS = 2_000;
const environment = deriveAgentEnvironment();
const GIT_COMMON_DIR = getGitCommonDir();
const RUNTIME_DIRECTORY = path.join(GIT_COMMON_DIR, "agent-environments");
const RUNTIME_PATH = path.join(
  RUNTIME_DIRECTORY,
  `${environment.identityHash}.json`,
);
let convexFunctionsReady = false;
let lastFunctionSpecCheckAt = 0;

function getGitCommonDir() {
  const result = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error("Could not locate this repository's shared Git directory.");
  }
  return path.resolve(PROJECT_ROOT, result.stdout.trim());
}

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
  if (!fs.existsSync(path.join(PROJECT_ROOT, "node_modules", "convex"))) {
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

async function occupiedAgentPorts(targetEnvironment = environment) {
  const ports = [
    targetEnvironment.appPort,
    targetEnvironment.convexCloudPort,
    targetEnvironment.convexSitePort,
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
  if (convexFunctionsReady) {
    return true;
  }
  if (Date.now() - lastFunctionSpecCheckAt < FUNCTION_SPEC_RETRY_MS) {
    return false;
  }
  lastFunctionSpecCheckAt = Date.now();

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
    if (result.status !== 0) {
      return false;
    }
    const functionSpec = JSON.parse(result.stdout);
    convexFunctionsReady =
      Array.isArray(functionSpec.functions) &&
      functionSpec.functions.length > 0;
    return convexFunctionsReady;
  } catch {
    return false;
  }
}

async function environmentIsReady() {
  return (await endpointsAreReady()) && convexFunctionsAreReady();
}

function readRuntime(runtimePath = RUNTIME_PATH) {
  try {
    return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  } catch {
    return null;
  }
}

function registeredWorktrees() {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      "Could not enumerate Git worktrees for agent environments.",
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function discoverRuntimeLeases() {
  const runtimePaths = [];
  if (fs.existsSync(RUNTIME_DIRECTORY)) {
    runtimePaths.push(
      ...fs
        .readdirSync(RUNTIME_DIRECTORY)
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => path.join(RUNTIME_DIRECTORY, entry)),
    );
  }
  for (const worktree of registeredWorktrees()) {
    const legacyPath = path.join(worktree, "output", "agent", "runtime.json");
    if (fs.existsSync(legacyPath)) {
      runtimePaths.push(legacyPath);
    }
  }

  const seenIdentities = new Set();
  return runtimePaths.flatMap((runtimePath) => {
    const runtime = readRuntime(runtimePath);
    if (!runtime || typeof runtime.identityHash !== "string") {
      return [{ classification: "invalid", runtime: null, runtimePath }];
    }
    if (seenIdentities.has(runtime.identityHash)) {
      return [];
    }
    seenIdentities.add(runtime.identityHash);
    const supervisorAlive = processMatches(
      runtime.pid,
      runtime.supervisorStartIdentity,
    );
    const worktreePresent = getWorktreePresence(runtime.identity);
    return [
      {
        ...classifyAgentRuntime(runtime, {
          supervisorAlive,
          worktreePresent,
        }),
        runtime,
        runtimePath,
        supervisorAlive,
        worktreePresent,
      },
    ];
  });
}

function currentRuntimeLease() {
  const sharedRuntime = readRuntime(RUNTIME_PATH);
  if (sharedRuntime) {
    return { runtime: sharedRuntime, runtimePath: RUNTIME_PATH };
  }
  const legacyRuntime = readRuntime(LEGACY_RUNTIME_PATH);
  return legacyRuntime
    ? { runtime: legacyRuntime, runtimePath: LEGACY_RUNTIME_PATH }
    : null;
}

function runtimeChildren(runtime) {
  return Array.isArray(runtime?.children) ? runtime.children : [];
}

function printEnvironment() {
  console.log("\nAgent environment ready");
  console.log(`App origin: ${environment.origin}`);
  console.log(`Convex URL: ${environment.convexUrl}`);
  console.log(`Playwright auth state: ${environment.authFile}\n`);
}

async function waitForExistingRuntime(runtime, runtimePath) {
  let childrenDeadline = null;
  let announcedProvisioning = false;
  while (processMatches(runtime.pid, runtime.supervisorStartIdentity)) {
    const currentRuntime = readRuntime(runtimePath);
    const children = runtimeChildren(currentRuntime);
    if (children.length === 0) {
      if (!announcedProvisioning) {
        console.log(
          "Existing agent environment is still provisioning; waiting for its exact supervisor to finish...",
        );
        announcedProvisioning = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    childrenDeadline ??= Date.now() + 60_000;
    if (
      currentRuntime &&
      children.length === 2 &&
      children.every((child) =>
        processMatches(child.pid, child.startIdentity),
      ) &&
      (await environmentIsReady())
    ) {
      printEnvironment();
      return "ready";
    }
    if (Date.now() >= childrenDeadline) {
      return "children-timeout";
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return "supervisor-exited";
}

function portConflictGuidance(ports) {
  const inspection = ports
    .map((port) => `lsof -nP -iTCP:${port} -sTCP:LISTEN`)
    .join("; ");
  return `Deterministic port(s) still occupied: ${ports.join(", ")}. Run pnpm agent:down if this worktree owns them. Identify the listeners with: ${inspection}`;
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

async function stopRecordedRuntime(
  runtime,
  runtimePath,
  expectedIdentityHash = null,
) {
  if (
    expectedIdentityHash !== null &&
    runtime.identityHash !== expectedIdentityHash
  ) {
    throw new Error(
      `${runtimePath} belongs to a different worktree. Refusing to stop any process.`,
    );
  }
  if (
    !Number.isInteger(runtime.appPort) ||
    !Number.isInteger(runtime.convexCloudPort) ||
    !Number.isInteger(runtime.convexSitePort)
  ) {
    throw new Error(`Malformed agent environment lease: ${runtimePath}`);
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
        `Could not stop the recorded ${child.label} process group in ${runtimePath}.`,
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
      `Could not stop the processes recorded in ${runtimePath}; stop them manually before deleting the lease.`,
    );
  }

  const occupiedPorts = await occupiedAgentPorts(runtime);
  if (occupiedPorts.length > 0) {
    throw new Error(
      `${portConflictGuidance(occupiedPorts)} Preserving lease ${runtimePath} so cleanup can be retried.`,
    );
  }

  fs.rmSync(runtimePath, { force: true });
}

async function recoverDeadRuntime(runtime, runtimePath) {
  if (processMatches(runtime.pid, runtime.supervisorStartIdentity)) {
    return false;
  }

  console.log(`Recovering dead agent lease: ${runtimePath}`);
  await stopRecordedRuntime(runtime, runtimePath);
  return true;
}

async function removeOwnedRuntime() {
  const runtime = readRuntime();
  if (runtime?.pid !== process.pid) {
    return;
  }
  if (
    runtimeChildren(runtime).some((child) =>
      processMatches(child.pid, child.startIdentity),
    )
  ) {
    return;
  }
  const occupiedPorts = await occupiedAgentPorts();
  if (occupiedPorts.length > 0) {
    console.error(
      `${portConflictGuidance(occupiedPorts)} Preserving lease ${RUNTIME_PATH} so cleanup can be retried.`,
    );
    return;
  }
  fs.rmSync(RUNTIME_PATH, { force: true });
}

function printRuntimeLeases(leases = discoverRuntimeLeases()) {
  if (leases.length === 0) {
    console.log("No recorded agent environments.");
    return;
  }
  console.table(
    leases.map((lease) => ({
      alive:
        lease.classification === "invalid" ? "unknown" : lease.supervisorAlive,
      classification: lease.classification,
      age:
        lease.classification === "invalid"
          ? "unknown"
          : formatAgentAge(lease.ageMs),
      origin: lease.runtime?.origin ?? "unknown",
      pid: lease.runtime?.pid ?? "unknown",
      port: lease.runtime?.appPort ?? "unknown",
      reapable:
        lease.classification === "invalid"
          ? "no (invalid lease)"
          : !lease.supervisorAlive
            ? "yes (default)"
            : lease.worktreePresent === false
              ? "no (manual PID action)"
              : lease.worktreePresent === null
                ? "no (worktree unknown)"
                : "no",
      worktree: lease.runtime?.identity ?? `invalid: ${lease.runtimePath}`,
      worktreePresent:
        lease.classification === "invalid" ? "unknown" : lease.worktreePresent,
    })),
  );
}

async function reapRuntimeLeases({ automatic = false }) {
  const leases = discoverRuntimeLeases();
  let failures = 0;
  let reaped = 0;
  for (const lease of leases) {
    const shouldReap = shouldReapAgentRuntime(lease);
    if (!shouldReap) continue;

    try {
      await stopRecordedRuntime(lease.runtime, lease.runtimePath);
      reaped += 1;
      console.log(`Reaped orphan agent environment: ${lease.runtime.identity}`);
    } catch (error) {
      failures += 1;
      console.error(
        `Could not reap ${lease.runtime?.identity ?? lease.runtimePath}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  if (!automatic) {
    printRuntimeLeases(discoverRuntimeLeases());
    console.log(`Reaped ${reaped} agent environment(s).`);
  }
  return failures;
}

async function main() {
  if (process.argv.includes("--ls")) {
    printRuntimeLeases();
    return;
  }
  if (process.argv.includes("--reap")) {
    const failures = await reapRuntimeLeases({});
    if (failures > 0) process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--down")) {
    const lease = currentRuntimeLease();
    if (!lease) {
      console.log(
        "No recorded agent environment is running for this worktree.",
      );
      return;
    }
    await stopRecordedRuntime(
      lease.runtime,
      lease.runtimePath,
      environment.identityHash,
    );
    console.log("Agent environment stopped.");
    return;
  }

  await reapRuntimeLeases({ automatic: true });

  const existingLease = currentRuntimeLease();
  const existingRuntime = existingLease?.runtime ?? null;
  const existingRuntimePath = existingLease?.runtimePath ?? RUNTIME_PATH;
  if (
    existingRuntime?.identityHash === environment.identityHash &&
    processMatches(existingRuntime.pid, existingRuntime.supervisorStartIdentity)
  ) {
    const waitResult = await waitForExistingRuntime(
      existingRuntime,
      existingRuntimePath,
    );
    if (waitResult === "ready") {
      return;
    }
    if (waitResult === "supervisor-exited") {
      const deadRuntime = readRuntime(existingRuntimePath);
      if (deadRuntime) {
        await recoverDeadRuntime(deadRuntime, existingRuntimePath);
      }
    } else {
      throw new Error(
        `This worktree's agent environment children are running but did not become ready. Run pnpm agent:down, then rerun pnpm agent:up. Lease: ${existingRuntimePath}`,
      );
    }
  } else if (existingRuntime) {
    await recoverDeadRuntime(existingRuntime, existingRuntimePath);
  }

  const occupiedPorts = await occupiedAgentPorts();
  if (occupiedPorts.length > 0) {
    throw new Error(
      `Refusing to start. ${portConflictGuidance(occupiedPorts)} Stop the conflicting worktree or process, then rerun pnpm agent:up.`,
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
        (await waitForExistingRuntime(runtime, RUNTIME_PATH)) === "ready"
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
    const forcedKillTimer = setTimeout(() => {
      for (const { child } of children) {
        if (processGroupExists(child.pid)) {
          signalChildProcessGroup(child.pid, "SIGKILL");
        }
      }
    }, 5_000);
    forcedKillTimer.unref();
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
  await removeOwnedRuntime();
  process.exitCode = externallyStopped ? 0 : firstExit.code || 1;
}

main().catch(async (error) => {
  await removeOwnedRuntime();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
