export async function sha256Encodings(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest);
  return {
    hex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    ),
  };
}

/**
 * Production Convex `_storage.sha256` is base16 (hex):
 * https://docs.convex.dev/file-storage/file-metadata
 *
 * convex-test@0.0.55 models the same digest as base64. Normalize that test
 * double at the boundary so production and tests share the hex comparison.
 */
export function normalizeStorageSha256(sha256: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(sha256)) return sha256.toLowerCase();
  try {
    const bytes = Uint8Array.from(atob(sha256), (character) =>
      character.charCodeAt(0),
    );
    return bytes.length === 32
      ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        )
      : null;
  } catch {
    return null;
  }
}
