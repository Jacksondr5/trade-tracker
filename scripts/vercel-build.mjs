#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONVEX_URL_ENV_VAR_NAME = "NEXT_PUBLIC_CONVEX_URL";
const PREVIEW_SEED_FUNCTION = "e2eSeed:setupPreviewData";
const WORKER_URL_ENV_VAR_NAME = "BRAVOS_WORKER_URL";
const WORKER_ROUTE_PATH = "/api/internal/bravos/run";
const WITHIN_CONVEX_DEPLOY_FLAG = "--within-convex-deploy";

const scriptPath = fileURLToPath(import.meta.url);

function isVercelPreviewBuild() {
  return process.env.VERCEL_ENV === "preview";
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: process.env,
    shell: false,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Vercel preview builds.`);
  }

  return value;
}

function deploymentHostFromVercelEnv() {
  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;

  if (!host) {
    throw new Error(
      "VERCEL_BRANCH_URL or VERCEL_URL is required for Vercel preview builds.",
    );
  }

  return host.replace(/^https?:\/\//, "");
}

function configureConvexPreviewEnvironment() {
  if (!isVercelPreviewBuild()) {
    console.log("Skipping Convex preview environment configuration.");
    return;
  }

  requireEnv("CONVEX_DEPLOY_KEY");

  const previewName = requireEnv("VERCEL_GIT_COMMIT_REF");
  const workerUrl = `https://${deploymentHostFromVercelEnv()}${WORKER_ROUTE_PATH}`;

  console.log(
    `Setting ${WORKER_URL_ENV_VAR_NAME} for Convex preview ${previewName}.`,
  );
  run("pnpm", [
    "exec",
    "convex",
    "env",
    "set",
    "--preview-name",
    previewName,
    WORKER_URL_ENV_VAR_NAME,
    workerUrl,
    "--force",
  ]);
}

function runNextBuildForConvexDeploy() {
  configureConvexPreviewEnvironment();
  run("pnpm", ["build"]);
}

function runConvexDeploy() {
  const args = [
    "exec",
    "convex",
    "deploy",
    "--cmd-url-env-var-name",
    CONVEX_URL_ENV_VAR_NAME,
    "--cmd",
    `${shellQuote(process.execPath)} ${shellQuote(scriptPath)} ${WITHIN_CONVEX_DEPLOY_FLAG}`,
  ];

  if (isVercelPreviewBuild()) {
    args.push(
      "--preview-create",
      requireEnv("VERCEL_GIT_COMMIT_REF"),
      "--preview-run",
      PREVIEW_SEED_FUNCTION,
    );
  }

  run("pnpm", args);
}

if (process.argv.includes(WITHIN_CONVEX_DEPLOY_FLAG)) {
  runNextBuildForConvexDeploy();
} else {
  runConvexDeploy();
}
