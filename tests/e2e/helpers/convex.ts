import { execFileSync } from "node:child_process";
import { getProjectRoot } from "./env";

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

export function runConvexFunction<T>(
  functionName: string,
  args?: Record<string, unknown>,
): T {
  const commandArgs = ["exec", "convex", "run", functionName];

  if (args !== undefined) {
    commandArgs.push(JSON.stringify(args));
  }

  const output = execFileSync("pnpm", commandArgs, {
    cwd: getProjectRoot(),
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
  });

  return parseConvexRunOutput<T>(output);
}
