// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  decryptBrokerageToken,
  encryptBrokerageToken,
} from "./brokerageSecrets";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);
const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const rotatedEncryptionKey = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

describe("brokerage connection secrets", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY = encryptionKey;
    t = convexTest(schema, modules);
  });

  afterEach(() => {
    delete process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY;
  });

  function asUser(ownerId = "owner-a") {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function createConnection(
    ownerId = "owner-a",
  ): Promise<Id<"brokerageConnections">> {
    return await asUser(ownerId).mutation(
      api.brokerageIngestion.upsertIbkrConnection,
      { queryId: "123456", status: "needs_setup" },
    );
  }

  it("encrypts and decrypts a token with its owner and connection binding", async () => {
    const connectionId = await createConnection();
    const plaintext = "round-trip-secret-token";
    const encrypted = await encryptBrokerageToken(plaintext, {
      connectionId,
      ownerId: "owner-a",
    });

    expect(encrypted.ciphertext).not.toContain(plaintext);
    await expect(
      decryptBrokerageToken(encrypted, {
        connectionId,
        ownerId: "owner-a",
      }),
    ).resolves.toBe(plaintext);
    await expect(
      decryptBrokerageToken(encrypted, {
        connectionId,
        ownerId: "owner-b",
      }),
    ).rejects.toThrow("could not be decrypted");
    const otherConnectionId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("brokerageConnections", {
        createdAt: now,
        ownerId: "owner-a",
        queryId: "654321",
        source: "ibkr",
        status: "needs_setup",
        updatedAt: now,
      });
    });
    await expect(
      decryptBrokerageToken(encrypted, {
        connectionId: otherConnectionId,
        ownerId: "owner-a",
      }),
    ).rejects.toThrow("could not be decrypted");
  });

  it("keeps old rows decryptable while new writes use a rotated key version", async () => {
    const connectionId = await createConnection();
    const binding = { connectionId, ownerId: "owner-a" };
    const versionOne = await encryptBrokerageToken(
      "version-one-token",
      binding,
      {
        BROKERAGE_TOKEN_ENCRYPTION_KEY: encryptionKey,
        BROKERAGE_TOKEN_ENCRYPTION_KEY_VERSION: "1",
      },
    );
    const rotatedEnvironment = {
      BROKERAGE_TOKEN_ENCRYPTION_KEY: rotatedEncryptionKey,
      BROKERAGE_TOKEN_ENCRYPTION_KEY_V1: encryptionKey,
      BROKERAGE_TOKEN_ENCRYPTION_KEY_VERSION: "2",
    };
    const versionTwo = await encryptBrokerageToken(
      "version-two-token",
      binding,
      rotatedEnvironment,
    );

    expect(versionOne.keyVersion).toBe(1);
    expect(versionTwo.keyVersion).toBe(2);
    await expect(
      decryptBrokerageToken(versionOne, binding, rotatedEnvironment),
    ).resolves.toBe("version-one-token");
    await expect(
      decryptBrokerageToken(versionTwo, binding, rotatedEnvironment),
    ).resolves.toBe("version-two-token");
  });

  it("stores only encrypted material and exposes only configuration metadata", async () => {
    const connectionId = await createConnection();
    const plaintext = "write-only-client-secret";

    const result = await asUser().action(
      api.brokerageSecrets.setIbkrConnectionToken,
      { connectionId, token: plaintext },
    );
    const [storedSecret] = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").collect(),
    );
    const status = await asUser().query(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
    );

    expect(result).toMatchObject({ configured: true });
    expect(JSON.stringify(result)).not.toContain(plaintext);
    expect(storedSecret).toMatchObject({
      connectionId,
      keyVersion: 1,
      ownerId: "owner-a",
    });
    expect(storedSecret.ciphertext).not.toContain(plaintext);
    expect(status.connections[0]).toMatchObject({
      _id: connectionId,
      status: "active",
      tokenConfigured: true,
    });
    expect(JSON.stringify(status)).not.toContain(plaintext);
    expect(JSON.stringify(status)).not.toContain(storedSecret.ciphertext);
    expect(JSON.stringify(status)).not.toContain(storedSecret.iv);
  });

  it("replaces a token in place without allowing cross-owner writes", async () => {
    const connectionId = await createConnection();
    await asUser().action(api.brokerageSecrets.setIbkrConnectionToken, {
      connectionId,
      token: "first-secret",
    });
    const first = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").unique(),
    );
    if (!first) throw new Error("Expected an encrypted brokerage secret");

    await expect(
      asUser("owner-b").action(api.brokerageSecrets.setIbkrConnectionToken, {
        connectionId,
        token: "attacker-secret",
      }),
    ).rejects.toThrow("Brokerage connection not found");
    await asUser().action(api.brokerageSecrets.setIbkrConnectionToken, {
      connectionId,
      token: "replacement-secret",
    });
    const secrets = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").collect(),
    );

    expect(secrets).toHaveLength(1);
    expect(secrets[0]._id).toBe(first._id);
    expect(secrets[0].ciphertext).not.toBe(first.ciphertext);
    await expect(
      decryptBrokerageToken(secrets[0], {
        connectionId,
        ownerId: "owner-a",
      }),
    ).resolves.toBe("replacement-secret");
  });
});
