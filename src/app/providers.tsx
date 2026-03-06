"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { env } from "~/env";
import { useMemo } from "react";
import { NavigationHistoryTracker } from "~/components/NavigationHistoryTracker";

const client = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export const Providers = ({
  authToken,
  children,
}: {
  authToken?: string;
  children: React.ReactNode;
}) => {
  const convex = useMemo(() => {
    if (authToken) {
      client.setAuth(async () => authToken);
    }
    return client;
  }, [authToken]);

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <NavigationHistoryTracker />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};
