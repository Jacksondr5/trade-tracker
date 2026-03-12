import { preloadQuery } from "convex/nextjs";
import { AuthGate } from "~/components/AuthGate";
import { api } from "~/convex/_generated/api";
import { AppShell, NavigationDataProvider } from "~/components/app-shell";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";

export default async function AuthenticatedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = await getConvexTokenOrThrow();
  const preloadedHierarchy = await preloadQuery(
    api.navigation.getCampaignTradePlanHierarchy,
    {},
    { token },
  );

  return (
    <AuthGate>
      <NavigationDataProvider preloadedHierarchy={preloadedHierarchy}>
        <AppShell>{children}</AppShell>
      </NavigationDataProvider>
    </AuthGate>
  );
}
