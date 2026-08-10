import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  authFileForOrigin,
  deriveAgentEnvironment,
  parseDotenv,
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

test("updateDotenvFile preserves unrelated values and updates scoped values", () => {
  const directory = temporaryDirectory();
  const envFile = path.join(directory, ".env.local");
  fs.writeFileSync(envFile, "SECRET=keep\nAPP_URL=http://old\n");

  updateDotenvFile(envFile, {
    APP_URL: "http://localhost:12345",
    CONVEX_DEPLOY_KEY: null,
    PLAYWRIGHT_BASE_URL: "http://localhost:12345",
  });

  expect(parseDotenv(fs.readFileSync(envFile, "utf8"))).toEqual({
    APP_URL: "http://localhost:12345",
    PLAYWRIGHT_BASE_URL: "http://localhost:12345",
    SECRET: "keep",
  });
});
