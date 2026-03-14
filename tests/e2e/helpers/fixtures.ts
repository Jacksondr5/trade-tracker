import { execFileSync } from "node:child_process";
import {
  PLAYWRIGHT_ENV_FILE,
  getProjectRoot,
  isLocalPlaywrightTarget,
} from "./env";

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
  const output = execFileSync(
    "pnpm",
    ["exec", "convex", "run", "--env-file", PLAYWRIGHT_ENV_FILE, functionName],
    {
      cwd: getProjectRoot(),
      encoding: "utf8",
      env: process.env,
    },
  );

  return parseConvexRunOutput<T>(output);
}

export function setupPlaywrightFixtureState(): void {
  if (!isLocalPlaywrightTarget()) {
    return;
  }

  runConvexFunction("e2eSeed:resetPlaywrightData");
  runConvexFunction("e2eSeed:setupPreviewData");
}
