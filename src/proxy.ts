import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  hasAllowedUserIds,
  isAllowedClerkUserId,
} from "../shared/auth/allowlist";

const isPublicRoute = createRouteMatcher([
  "/",
  "/api/internal/bravos/run",
  "/private-instance",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export function shouldRedirectUnlistedUser(
  userId: string | null,
  allowedUserIds: string | undefined,
): boolean {
  return Boolean(
    userId &&
      hasAllowedUserIds(allowedUserIds) &&
      !isAllowedClerkUserId(userId, allowedUserIds),
  );
}

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const allowedUserIds = process.env.ALLOWED_USER_IDS;
  const hasConfiguredAllowlist = hasAllowedUserIds(allowedUserIds);

  // Convex requireUser is the fail-closed authorization boundary. This proxy
  // only provides a courtesy redirect, so failing closed here adds no security
  // while a missing Next.js variable can lock out a Convex-authorized owner.
  // An empty value therefore denies everyone in Convex but defers here.
  // Production does not receive the preview bootstrap write-back, so its only
  // source is the Next.js environment; do not change this defer to fail-closed.
  if (userId && !hasConfiguredAllowlist) {
    console.warn(
      "ALLOWED_USER_IDS is not configured in Next.js; proxy is deferring authorization to Convex.",
    );
  }

  if (
    shouldRedirectUnlistedUser(userId, allowedUserIds) &&
    request.nextUrl.pathname !== "/private-instance"
  ) {
    return NextResponse.redirect(new URL("/private-instance", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  return;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
