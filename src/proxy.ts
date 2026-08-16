import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAllowedClerkUserId } from "../shared/auth/allowlist";

const isPublicRoute = createRouteMatcher([
  "/",
  "/api/internal/bravos/run",
  "/private-instance",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  if (
    userId &&
    !isAllowedClerkUserId(userId, process.env.ALLOWED_USER_IDS) &&
    !request.nextUrl.pathname.startsWith("/private-instance")
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
