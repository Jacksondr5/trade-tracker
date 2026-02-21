import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ImportsPageClient from "./ImportsPageClient";

export default async function ImportsPage() {
  const token = await getConvexTokenOrThrow();
  const [preloadedInboxTrades, preloadedOpenTradePlans] = await Promise.all([
    preloadQuery(api.imports.listInboxTrades, {}, { token }),
    preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
  ]);

  return (
    <ImportsPageClient
      preloadedInboxTrades={preloadedInboxTrades}
      preloadedOpenTradePlans={preloadedOpenTradePlans}
    />
  );
}
