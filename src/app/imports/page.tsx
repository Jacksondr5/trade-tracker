import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ImportsPageClient from "./ImportsPageClient";

export default async function ImportsPage() {
  const token = await getConvexTokenOrThrow();
  const [
    preloadedInboxTrades,
    preloadedOpenTradePlans,
    preloadedAccountMappings,
  ] = await Promise.all([
    preloadQuery(api.imports.listInboxTrades, {}, { token }),
    preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
  ]);

  return (
    <ImportsPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedInboxTrades={preloadedInboxTrades}
      preloadedOpenTradePlans={preloadedOpenTradePlans}
    />
  );
}
