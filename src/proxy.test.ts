import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: <T>(handler: T) => handler,
  createRouteMatcher: () => () => false,
}));

vi.mock("next/server", () => ({
  NextResponse: { redirect: vi.fn() },
}));

import proxy, { shouldRedirectUnlistedUser } from "./proxy";

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

  it("warns an authenticated user when the proxy defers to Convex", async () => {
    const originalAllowedUserIds = process.env.ALLOWED_USER_IDS;
    delete process.env.ALLOWED_USER_IDS;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = Object.assign(
      async () => ({ userId: "user_unlisted" }),
      { protect: vi.fn() },
    );

    await proxy(auth, { nextUrl: { pathname: "/dashboard" } });
    await proxy(auth, { nextUrl: { pathname: "/dashboard" } });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      "ALLOWED_USER_IDS is not configured in Next.js; proxy is deferring authorization to Convex.",
    );

    warning.mockRestore();
    if (originalAllowedUserIds === undefined) {
      delete process.env.ALLOWED_USER_IDS;
    } else {
      process.env.ALLOWED_USER_IDS = originalAllowedUserIds;
    }
  });
});
