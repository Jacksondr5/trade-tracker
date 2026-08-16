// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ALLOWED_USER_IDS = "ALLOWED_USER_IDS";
const allowedOwner = "https://clerk.example.test|user_allowed";
const playwrightOwner = "https://clerk.example.test|user_playwright";

describe.sequential("identity allowlist", () => {
  let t: ReturnType<typeof convexTest>;
  let originalAllowedUserIds: string | undefined;

  beforeEach(() => {
    t = convexTest(schema, modules);
    originalAllowedUserIds = process.env[ALLOWED_USER_IDS];
    delete process.env[ALLOWED_USER_IDS];
  });

  afterEach(() => {
    if (originalAllowedUserIds === undefined) {
      delete process.env[ALLOWED_USER_IDS];
    } else {
      process.env[ALLOWED_USER_IDS] = originalAllowedUserIds;
    }
  });

  function asUser(tokenIdentifier: string) {
    return t.withIdentity({ tokenIdentifier });
  }

  it("denies every authenticated identity when ALLOWED_USER_IDS is unset", async () => {
    await expect(
      asUser(allowedOwner).query(api.positions.getPositions, {}),
    ).rejects.toThrow("Unauthorized");
  });

  it("denies every authenticated identity when ALLOWED_USER_IDS is empty", async () => {
    process.env[ALLOWED_USER_IDS] = "  ";

    await expect(
      asUser(allowedOwner).query(api.positions.getPositions, {}),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects a non-listed identity", async () => {
    process.env[ALLOWED_USER_IDS] = allowedOwner;

    await expect(
      asUser("https://clerk.example.test|user_not_listed").query(
        api.positions.getPositions,
        {},
      ),
    ).rejects.toThrow("Unauthorized");
  });

  it("allows an explicitly listed identity with whitespace after a comma", async () => {
    process.env[ALLOWED_USER_IDS] = `https://clerk.example.test|user_other, ${allowedOwner}`;

    await expect(
      asUser(allowedOwner).query(api.positions.getPositions, {}),
    ).resolves.toEqual([]);
  });

  it("allows the Playwright fixture identity used by local and preview environments", async () => {
    process.env[ALLOWED_USER_IDS] = playwrightOwner;

    await expect(
      asUser(playwrightOwner).query(api.positions.getPositions, {}),
    ).resolves.toEqual([]);
  });
});
