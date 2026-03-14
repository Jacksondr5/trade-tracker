"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();

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
