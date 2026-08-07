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
      BROKERAGE_TOKEN_ENCRYPTION_KEY: encryptionKey,
      BROKERAGE_TOKEN_ENCRYPTION_KEY_V2: rotatedEncryptionKey,
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

  it("decrypts an explicitly versioned row without parsing the current version", async () => {
    const connectionId = await createConnection();
    const binding = { connectionId, ownerId: "owner-a" };
    const versionOne = await encryptBrokerageToken(
      "explicit-version-one-token",
      binding,
      {
        BROKERAGE_TOKEN_ENCRYPTION_KEY_V1: encryptionKey,
        BROKERAGE_TOKEN_ENCRYPTION_KEY_VERSION: "1",
      },
    );

    await expect(
      decryptBrokerageToken(versionOne, binding, {
        BROKERAGE_TOKEN_ENCRYPTION_KEY_V1: encryptionKey,
        BROKERAGE_TOKEN_ENCRYPTION_KEY_VERSION: "not-a-version",
      }),
    ).resolves.toBe("explicit-version-one-token");
  });

  it("stores only encrypted material and exposes only configuration metadata", async () => {
    const connectionId = await createConnection();
    const plaintext = "write-only-client-secret";

    const result = await asUser().action(
      api.brokerageSecrets.setIbkrConnectionToken,
      {
        connectionId,
        metadata: {
          accountId: "U7654321",
          label: "Primary IBKR",
          queryId: "987654",
          tokenExpiresAt: 1_800_000_000_000,
        },
        token: plaintext,
      },
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
      accountId: "U7654321",
      label: "Primary IBKR",
      queryId: "987654",
      status: "active",
      tokenConfigured: true,
      tokenExpiresAt: 1_800_000_000_000,
    });
    expect(JSON.stringify(status)).not.toContain(plaintext);
    expect(JSON.stringify(status)).not.toContain(storedSecret.ciphertext);
    expect(JSON.stringify(status)).not.toContain(storedSecret.iv);
  });

  it("does not commit replacement metadata when encryption fails", async () => {
    const connectionId = await createConnection();
    await asUser().action(api.brokerageSecrets.setIbkrConnectionToken, {
      connectionId,
      metadata: {
        label: "Original metadata",
        queryId: "123456",
        tokenExpiresAt: 1_700_000_000_000,
      },
      token: "working-secret",
    });
    const originalSecret = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").unique(),
    );
    if (!originalSecret) {
      throw new Error("Expected an encrypted brokerage secret");
    }
    delete process.env.BROKERAGE_TOKEN_ENCRYPTION_KEY;

    await expect(
      asUser().action(api.brokerageSecrets.setIbkrConnectionToken, {
        connectionId,
        metadata: {
          label: "Uncommitted metadata",
          queryId: "654321",
          tokenExpiresAt: 1_900_000_000_000,
        },
        token: "replacement-secret",
      }),
    ).rejects.toThrow("key version 1 is not configured");
    const connection = await t.run(async (ctx) => ctx.db.get(connectionId));
    const storedSecret = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").unique(),
    );

    expect(connection).toMatchObject({
      label: "Original metadata",
      queryId: "123456",
      status: "active",
      tokenExpiresAt: 1_700_000_000_000,
    });
    expect(storedSecret).toMatchObject({
      _id: originalSecret._id,
      ciphertext: originalSecret.ciphertext,
    });
  });

  it("replaces a token in place without allowing cross-owner writes", async () => {
    const connectionId = await createConnection();
    await asUser().action(api.brokerageSecrets.setIbkrConnectionToken, {
      connectionId,
      metadata: {
        accountId: "U1234567",
        label: "Original label",
        queryId: "123456",
        tokenExpiresAt: 1_800_000_000_000,
      },
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
      metadata: { queryId: "654321" },
      token: "replacement-secret",
    });
    const secrets = await t.run(async (ctx) =>
      ctx.db.query("brokerageConnectionSecrets").collect(),
    );

    expect(secrets).toHaveLength(1);
    expect(secrets[0]._id).toBe(first._id);
    expect(secrets[0].ciphertext).not.toBe(first.ciphertext);
    const connection = await t.run(async (ctx) => ctx.db.get(connectionId));
    expect(connection).toMatchObject({
      accountId: "U1234567",
      label: "Original label",
      queryId: "654321",
      tokenExpiresAt: 1_800_000_000_000,
    });
    await expect(
      decryptBrokerageToken(secrets[0], {
        connectionId,
        ownerId: "owner-a",
      }),
    ).resolves.toBe("replacement-secret");
  });
});
