import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyAgentRuntime,
  formatAgentAge,
  getWorktreePresence,
  authFileForOrigin,
  deriveAgentEnvironment,
  parseDotenv,
  readLocalConvexConfig,
  updateDotenvFile,
} from "./agent-environment.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "agent-env-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("deriveAgentEnvironment", () => {
  test("is stable for a worktree and separates different worktrees", () => {
    const first = temporaryDirectory();
    const firstEnvironment = deriveAgentEnvironment(first);
    let secondEnvironment;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = deriveAgentEnvironment(temporaryDirectory());
      if (candidate.appPort !== firstEnvironment.appPort) {
        secondEnvironment = candidate;
        break;
      }
    }

    expect(firstEnvironment).toEqual(deriveAgentEnvironment(first));
    expect(secondEnvironment).toBeDefined();
    expect(secondEnvironment?.appPort).not.toBe(firstEnvironment.appPort);
    expect(secondEnvironment?.convexCloudPort).not.toBe(
      firstEnvironment.convexCloudPort,
    );
  });

  test("uses localhost for Clerk and separate Convex ports", () => {
    const environment = deriveAgentEnvironment(temporaryDirectory());

    expect(environment.origin).toBe(`http://localhost:${environment.appPort}`);
    expect(environment.convexUrl).toBe(
      `http://127.0.0.1:${environment.convexCloudPort}`,
    );
    expect(environment.convexSitePort).toBe(environment.convexCloudPort + 1);
  });
});

test("authFileForOrigin keys state by the complete origin", () => {
  const projectRoot = temporaryDirectory();
  const first = authFileForOrigin("http://localhost:3000", projectRoot);
  const second = authFileForOrigin("http://localhost:3001", projectRoot);
  const third = authFileForOrigin("https://localhost:3000", projectRoot);

  expect(first).not.toBe(second);
  expect(first).not.toBe(third);
  expect(first).toContain(path.join("output", "playwright", "auth"));
});

describe("agent runtime classification", () => {
  const runtime = { startedAt: "2026-08-09T12:00:00.000Z" };
  const now = Date.parse("2026-08-09T17:00:00.000Z");

  test("only treats a dead exact supervisor as orphaned", () => {
    expect(
      classifyAgentRuntime(runtime, {
        now,
        supervisorAlive: true,
      }).classification,
    ).toBe("active");
    expect(
      classifyAgentRuntime(runtime, {
        now,
        supervisorAlive: false,
      }).classification,
    ).toBe("orphan");
  });

  test("reports lease age from its start time", () => {
    expect(
      classifyAgentRuntime(runtime, { now, supervisorAlive: true }),
    ).toEqual({ ageMs: 5 * 60 * 60_000, classification: "active" });
  });

  test("distinguishes only ENOENT from unknown worktree stat failures", () => {
    expect(getWorktreePresence("/worktree", () => ({}))).toBe(true);
    expect(
      getWorktreePresence("/worktree", () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }),
    ).toBe(false);
    const unknownPresence = getWorktreePresence("/worktree", () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    });
    expect(unknownPresence).toBeNull();
    expect(
      classifyAgentRuntime(runtime, {
        now,
        supervisorAlive: true,
        worktreePresent: unknownPresence,
      }).classification,
    ).toBe("active");
  });

  test("formats age for lifecycle output", () => {
    expect(formatAgentAge(null)).toBe("unknown");
    expect(formatAgentAge(45_000)).toBe("45s");
    expect(formatAgentAge(12 * 60_000)).toBe("12m");
    expect(formatAgentAge(5 * 60 * 60_000)).toBe("5h");
    expect(formatAgentAge(2 * 24 * 60 * 60_000)).toBe("2d");
  });
});

test("updateDotenvFile preserves unrelated values and updates scoped values", () => {
  const directory = temporaryDirectory();
  const envFile = path.join(directory, ".env.local");
  fs.writeFileSync(
    envFile,
    "SECRET=keep\nAPP_URL=http://old\nCONVEX_DEPLOY_KEY=inherited\n",
  );

  updateDotenvFile(envFile, {
    APP_URL: "http://localhost:12345/path # $ ` value",
    CONVEX_DEPLOY_KEY: null,
    PLAYWRIGHT_BASE_URL: "http://localhost:12345",
  });

  expect(parseDotenv(fs.readFileSync(envFile, "utf8"))).toEqual({
    APP_URL: "http://localhost:12345/path # $ ` value",
    PLAYWRIGHT_BASE_URL: "http://localhost:12345",
    SECRET: "keep",
  });

  const sourced = spawnSync(
    "sh",
    ["-c", '. "$1"; printf "%s" "$APP_URL"', "sh", envFile],
    { encoding: "utf8" },
  );
  expect(sourced.status).toBe(0);
  expect(sourced.stdout).toBe("http://localhost:12345/path # $ ` value");
});

test("readLocalConvexConfig rejects malformed and incomplete files", () => {
  const directory = temporaryDirectory();
  const configFile = path.join(directory, "config.json");

  fs.writeFileSync(configFile, "{malformed");
  expect(() => readLocalConvexConfig(configFile)).toThrow(SyntaxError);

  fs.writeFileSync(configFile, JSON.stringify({ ports: { cloud: 3210 } }));
  expect(() => readLocalConvexConfig(configFile)).toThrow(
    "Local Convex config is incomplete.",
  );
});
