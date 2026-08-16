#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeAllowedUserIds } from "./agent-environment.mjs";

const CONVEX_URL_ENV_VAR_NAME = "NEXT_PUBLIC_CONVEX_URL";
const ALLOWED_USER_IDS_ENV_VAR_NAME = "ALLOWED_USER_IDS";
const PLAYWRIGHT_OWNER_ID_ENV_VAR_NAME = "PLAYWRIGHT_OWNER_ID";
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

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
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
  const playwrightOwnerId = optionalEnv(PLAYWRIGHT_OWNER_ID_ENV_VAR_NAME);
  const allowedUserIds = mergeAllowedUserIds(
    process.env[ALLOWED_USER_IDS_ENV_VAR_NAME],
    playwrightOwnerId,
  );
  process.env[ALLOWED_USER_IDS_ENV_VAR_NAME] = allowedUserIds;
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
  if (playwrightOwnerId) {
    run("pnpm", [
      "exec",
      "convex",
      "env",
      "set",
      "--preview-name",
      previewName,
      PLAYWRIGHT_OWNER_ID_ENV_VAR_NAME,
      playwrightOwnerId,
      "--force",
    ]);
  } else {
    console.log(
      "PLAYWRIGHT_OWNER_ID is not configured; skipping preview fixture provisioning and preview E2E will fail.",
    );
  }
  run("pnpm", [
    "exec",
    "convex",
    "env",
    "set",
    "--preview-name",
    previewName,
    ALLOWED_USER_IDS_ENV_VAR_NAME,
    allowedUserIds,
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
    args.push("--preview-create", requireEnv("VERCEL_GIT_COMMIT_REF"));

    if (optionalEnv(PLAYWRIGHT_OWNER_ID_ENV_VAR_NAME)) {
      args.push("--preview-run", PREVIEW_SEED_FUNCTION);
    } else {
      console.log(
        "PLAYWRIGHT_OWNER_ID is not configured; preview fixture seeding is skipped and preview E2E will fail.",
      );
    }
  }

  run("pnpm", args);
}

if (process.argv.includes(WITHIN_CONVEX_DEPLOY_FLAG)) {
  runNextBuildForConvexDeploy();
} else {
  runConvexDeploy();
}
