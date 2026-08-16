import { expect, it } from "vitest";
import { normalizeStorageSha256, sha256Encodings } from "./sha256";

it("normalizes production and convex-test SHA-256 representations to lowercase hex", async () => {
  const expectedHex =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  expect((await sha256Encodings("abc")).hex).toBe(expectedHex);
  expect(normalizeStorageSha256(expectedHex)).toBe(expectedHex);
  expect(normalizeStorageSha256(expectedHex.toUpperCase())).toBe(expectedHex);
  expect(
    normalizeStorageSha256("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0="),
  ).toBe(expectedHex);
  expect(normalizeStorageSha256("not-a-sha256")).toBeNull();
});
