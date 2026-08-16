import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: <T>(handler: T) => handler,
  createRouteMatcher: () => () => false,
}));

vi.mock("next/server", () => ({
  NextResponse: { redirect: vi.fn() },
}));

import { shouldRedirectUnlistedUser } from "./proxy";

describe("proxy allowlist courtesy redirect", () => {
  it.each([undefined, "", "   ", "\t\n"]) (
    "defers to Convex when ALLOWED_USER_IDS is %j",
    (allowedUserIds) => {
      expect(
        shouldRedirectUnlistedUser("user_unlisted", allowedUserIds),
      ).toBe(false);
    },
  );

  it("redirects only an unlisted user when the allowlist is configured", () => {
    const allowlist = "https://clerk.example.test|user_allowed";

    expect(shouldRedirectUnlistedUser("user_unlisted", allowlist)).toBe(true);
    expect(shouldRedirectUnlistedUser("user_allowed", allowlist)).toBe(false);
  });
});
