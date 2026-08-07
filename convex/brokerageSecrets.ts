import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const DEFAULT_BROKERAGE_TOKEN_KEY_VERSION = 1;
const AES_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const MAX_TOKEN_LENGTH = 4_096;

type EncryptedBrokerageToken = {
  ciphertext: string;
  iv: string;
  keyVersion: number;
};

type BrokerageTokenBinding = {
  connectionId: Id<"brokerageConnections">;
  ownerId: string;
};

const brokerageTokenMetadataValidator = v.object({
  accountId: v.optional(v.string()),
  label: v.optional(v.string()),
  queryId: v.string(),
  tokenExpiresAt: v.optional(v.number()),
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new ConvexError(
      "Brokerage token encryption key must be valid base64",
    );
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function encryptionKeyEnvironmentName(keyVersion: number): string {
  return `BROKERAGE_TOKEN_ENCRYPTION_KEY_V${keyVersion}`;
}

function currentEncryptionKeyVersion(
  env: Record<string, string | undefined>,
): number {
  const configuredVersion = env.BROKERAGE_TOKEN_ENCRYPTION_KEY_VERSION?.trim();
  if (!configuredVersion) return DEFAULT_BROKERAGE_TOKEN_KEY_VERSION;
  const keyVersion = Number(configuredVersion);
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new ConvexError(
      "Brokerage token encryption key version must be a positive integer",
    );
  }
  return keyVersion;
}

async function importEncryptionKey(
  keyVersion: number,
  env: Record<string, string | undefined>,
): Promise<CryptoKey> {
  const versionedKey = env[encryptionKeyEnvironmentName(keyVersion)]?.trim();
  const unversionedKey = env.BROKERAGE_TOKEN_ENCRYPTION_KEY?.trim();
  const encodedKey =
    versionedKey ||
    (keyVersion === DEFAULT_BROKERAGE_TOKEN_KEY_VERSION
      ? unversionedKey
      : unversionedKey && keyVersion === currentEncryptionKeyVersion(env)
        ? unversionedKey
        : undefined);
  if (!encodedKey) {
    throw new ConvexError(
      `Brokerage token encryption key version ${keyVersion} is not configured`,
    );
  }
  const rawKey = base64ToBytes(encodedKey);
  if (rawKey.byteLength !== AES_KEY_BYTES) {
    throw new ConvexError(
      "Brokerage token encryption key must decode to exactly 32 bytes",
    );
  }
  return await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"],
  );
}

function additionalData(args: BrokerageTokenBinding & { keyVersion: number }) {
  return new TextEncoder().encode(
    JSON.stringify([args.ownerId, args.connectionId, args.keyVersion]),
  );
}

export async function encryptBrokerageToken(
  token: string,
  binding: BrokerageTokenBinding,
  env: Record<string, string | undefined> = process.env,
): Promise<EncryptedBrokerageToken> {
  const keyVersion = currentEncryptionKeyVersion(env);
  const key = await importEncryptionKey(keyVersion, env);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: additionalData({ ...binding, keyVersion }),
      iv: toArrayBuffer(iv),
      name: "AES-GCM",
    },
    key,
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    keyVersion,
  };
}

export async function decryptBrokerageToken(
  encrypted: EncryptedBrokerageToken,
  binding: BrokerageTokenBinding,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const key = await importEncryptionKey(encrypted.keyVersion, env);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        additionalData: additionalData({
          ...binding,
          keyVersion: encrypted.keyVersion,
        }),
        iv: toArrayBuffer(base64ToBytes(encrypted.iv)),
        name: "AES-GCM",
      },
      key,
      toArrayBuffer(base64ToBytes(encrypted.ciphertext)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ConvexError(
      "Stored brokerage credential could not be decrypted; replace it in connection settings",
    );
  }
}

export const setIbkrConnectionToken = action({
  args: {
    connectionId: v.id("brokerageConnections"),
    metadata: v.optional(brokerageTokenMetadataValidator),
    token: v.string(),
  },
  returns: v.object({ configured: v.literal(true), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const token = args.token.trim();
    if (!token) throw new ConvexError("IBKR Flex token is required");
    if (token.length > MAX_TOKEN_LENGTH) {
      throw new ConvexError(
        `IBKR Flex token must be ${MAX_TOKEN_LENGTH} characters or less`,
      );
    }
    const encrypted = await encryptBrokerageToken(token, {
      connectionId: args.connectionId,
      ownerId,
    });
    const updatedAt = Date.now();
    await ctx.runMutation(internal.brokerageSecrets.storeEncryptedToken, {
      ...encrypted,
      connectionId: args.connectionId,
      metadata: args.metadata,
      ownerId,
      updatedAt,
    });
    return { configured: true as const, updatedAt };
  },
});

export const storeEncryptedToken = internalMutation({
  args: {
    ciphertext: v.string(),
    connectionId: v.id("brokerageConnections"),
    iv: v.string(),
    keyVersion: v.number(),
    metadata: v.optional(brokerageTokenMetadataValidator),
    ownerId: v.string(),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.ownerId !== args.ownerId) {
      throw new ConvexError("Brokerage connection not found");
    }
    const existing = await ctx.db
      .query("brokerageConnectionSecrets")
      .withIndex("by_connectionId", (query) =>
        query.eq("connectionId", connection._id),
      )
      .unique();
    const secret = {
      ciphertext: args.ciphertext,
      connectionId: connection._id,
      iv: args.iv,
      keyVersion: args.keyVersion,
      ownerId: args.ownerId,
      updatedAt: args.updatedAt,
    };
    if (existing) {
      await ctx.db.replace(existing._id, secret);
    } else {
      await ctx.db.insert("brokerageConnectionSecrets", secret);
    }
    const metadataPatch = args.metadata
      ? {
          queryId: args.metadata.queryId,
          ...(args.metadata.accountId === undefined
            ? {}
            : { accountId: args.metadata.accountId }),
          ...(args.metadata.label === undefined
            ? {}
            : { label: args.metadata.label }),
          ...(args.metadata.tokenExpiresAt === undefined
            ? {}
            : { tokenExpiresAt: args.metadata.tokenExpiresAt }),
        }
      : {};
    await ctx.db.patch(connection._id, {
      ...metadataPatch,
      connectionError: undefined,
      status: connection.status === "paused" ? "paused" : "active",
      updatedAt: args.updatedAt,
    });
    return null;
  },
});

export const getEncryptedTokenForConnection = internalQuery({
  args: {
    connectionId: v.id("brokerageConnections"),
    ownerId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      ciphertext: v.string(),
      iv: v.string(),
      keyVersion: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.ownerId !== args.ownerId) return null;
    const secret = await ctx.db
      .query("brokerageConnectionSecrets")
      .withIndex("by_connectionId", (query) =>
        query.eq("connectionId", connection._id),
      )
      .unique();
    if (!secret || secret.ownerId !== args.ownerId) return null;
    return {
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      keyVersion: secret.keyVersion,
    };
  },
});
