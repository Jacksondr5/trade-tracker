import { describe, expect, it } from "vitest";
import {
  hasAllowedUserIds,
  isAllowedClerkUserId,
  isAllowedTokenIdentifier,
} from "./allowlist";

describe("hasAllowedUserIds", () => {
  it.each([undefined, "", "  ", ", ,"]) (
    "treats %j as an unconfigured allowlist",
    (allowedUserIds) => {
      expect(hasAllowedUserIds(allowedUserIds)).toBe(false);
    },
  );

  it("recognizes configured identities despite surrounding whitespace", () => {
    expect(hasAllowedUserIds(" owner-a , owner-b ")).toBe(true);
  });
});

describe("allowlist identity matching", () => {
  const tokenIdentifier = "https://clerk.example.test|user_allowed";

  it("requires an exact token identifier for Convex authorization", () => {
    expect(isAllowedTokenIdentifier(tokenIdentifier, tokenIdentifier)).toBe(
      true,
    );
    expect(
      isAllowedTokenIdentifier(tokenIdentifier.slice(0, -1), tokenIdentifier),
    ).toBe(false);
    expect(
      isAllowedTokenIdentifier(`${tokenIdentifier}x`, tokenIdentifier),
    ).toBe(false);
  });

  it("matches Clerk user ids against a configured token identifier suffix", () => {
    expect(
      isAllowedClerkUserId(
        "user_allowed",
        `https://other.example.test|user_other, ${tokenIdentifier}`,
      ),
    ).toBe(true);
    expect(isAllowedClerkUserId("user_other", tokenIdentifier)).toBe(false);
  });
});
