import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const PORT_SLOT_COUNT = 8_000;

export function deriveAgentEnvironment(worktreePath = PROJECT_ROOT) {
  const identity = fs.realpathSync(worktreePath);
  const digest = createHash("sha256").update(identity).digest();
  const slot = digest.readUInt32BE(0) % PORT_SLOT_COUNT;
  const appPort = 12_000 + slot;
  const convexCloudPort = 30_000 + slot * 2;
  const convexSitePort = convexCloudPort + 1;
  const origin = `http://localhost:${appPort}`;

  return {
    appPort,
    authFile: authFileForOrigin(origin, worktreePath),
    convexCloudPort,
    convexSitePort,
    convexSiteUrl: `http://127.0.0.1:${convexSitePort}`,
    convexUrl: `http://127.0.0.1:${convexCloudPort}`,
    identity,
    identityHash: createHash("sha256").update(identity).digest("hex"),
    origin,
  };
}

export function authFileForOrigin(origin, projectRoot = PROJECT_ROOT) {
  const parsed = new URL(origin);
  const readableOrigin =
    `${parsed.protocol.slice(0, -1)}-${parsed.hostname}-${parsed.port || "default"}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");
  const originHash = createHash("sha256")
    .update(parsed.origin)
    .digest("hex")
    .slice(0, 8);

  return path.join(
    projectRoot,
    "output",
    "playwright",
    "auth",
    `${readableOrigin}-${originHash}.json`,
  );
}

export function parseDotenv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith("#") && line.includes("="),
      )
      .map((line) => {
        const delimiterIndex = line.indexOf("=");
        const key = line.slice(0, delimiterIndex).trim();
        let value = line.slice(delimiterIndex + 1).trim();

        if (
          value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
        ) {
          value = value.slice(1, -1);
        }

        return [key, value];
      }),
  );
}

export function updateDotenvFile(filePath, updates) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const remainingUpdates = new Map(Object.entries(updates));
  const updatedLines = existing
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (!match || !remainingUpdates.has(match[1])) {
        return line;
      }

      const value = remainingUpdates.get(match[1]);
      remainingUpdates.delete(match[1]);
      return value === null ? null : `${match[1]}=${value}`;
    })
    .filter((line) => line !== null);

  while (updatedLines.length > 0 && updatedLines.at(-1) === "") {
    updatedLines.pop();
  }
  if (remainingUpdates.size > 0 && updatedLines.length > 0) {
    updatedLines.push("");
  }
  for (const [key, value] of remainingUpdates) {
    if (value !== null) {
      updatedLines.push(`${key}=${value}`);
    }
  }
  updatedLines.push("");

  fs.writeFileSync(filePath, updatedLines.join("\n"), { mode: 0o600 });
}

export function getProjectRoot() {
  return PROJECT_ROOT;
}
