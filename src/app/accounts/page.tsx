import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import AccountsPageClient from "./AccountsPageClient";

export default async function AccountsPage() {
  const token = await getConvexTokenOrThrow();

  const [preloadedMappings, preloadedKnownAccounts] = await Promise.all([
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(api.accountMappings.listKnownBrokerageAccounts, {}, { token }),
  ]);

  return (
    <AccountsPageClient
      preloadedKnownAccounts={preloadedKnownAccounts}
      preloadedMappings={preloadedMappings}
    />
  );
}
