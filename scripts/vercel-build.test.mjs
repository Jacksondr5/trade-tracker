import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

const temporaryDirectories = [];
const scriptPath = path.join(process.cwd(), "scripts", "vercel-build.mjs");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function runVercelBuild(args, environment) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-build-"));
  temporaryDirectories.push(directory);
  const binDirectory = path.join(directory, "bin");
  const captureFile = path.join(directory, "pnpm-arguments.log");
  fs.mkdirSync(binDirectory);
  const pnpmPath = path.join(binDirectory, "pnpm");
  fs.writeFileSync(
    pnpmPath,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CAPTURE_FILE"\n',
  );
  fs.chmodSync(pnpmPath, 0o755);

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...environment,
      CAPTURE_FILE: captureFile,
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
    },
  });

  return {
    ...result,
    invocations: fs.existsSync(captureFile)
      ? fs.readFileSync(captureFile, "utf8")
      : "",
  };
}

test("deploys a preview without a Playwright fixture and skips its seed hook", () => {
  const result = runVercelBuild([], {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "fixture-optional",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "skipping preview fixture seeding. Preview E2E will fail, and if ALLOWED_USER_IDS is also unset this preview will authorize no one",
  );
  expect(result.invocations).toContain("--preview-create fixture-optional");
  expect(result.invocations).not.toContain("--preview-run");
});

test("preserves the configured allowlist when the Playwright fixture is absent", () => {
  const result = runVercelBuild(["--within-convex-deploy"], {
    ALLOWED_USER_IDS: " https://clerk.example.test|user_owner ",
    CONVEX_DEPLOY_KEY: "test-key",
    VERCEL_BRANCH_URL: "fixture-optional.vercel.app",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "fixture-optional",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "skipping Convex preview fixture provisioning. Preview E2E will fail, and if ALLOWED_USER_IDS is also unset this preview will authorize no one",
  );
  expect(result.invocations).toContain(
    "ALLOWED_USER_IDS https://clerk.example.test|user_owner --force",
  );
  expect(result.invocations).not.toContain("PLAYWRIGHT_OWNER_ID");
});
