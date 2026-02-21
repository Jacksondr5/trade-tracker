"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { usePathname } from "next/navigation";

const PUBLIC_ROUTE_PREFIXES = ["/sign-in", "/sign-up"];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();

  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  if (
    !isClerkLoaded ||
    !isSignedIn ||
    isConvexAuthLoading ||
    !isAuthenticated
  ) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 text-slate-11">
          Loading...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
