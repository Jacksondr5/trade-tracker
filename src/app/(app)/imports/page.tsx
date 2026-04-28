import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ImportsPageClient from "./ImportsPageClient";

export default async function ImportsPage() {
  const token = await getConvexTokenOrThrow();
  const [
    preloadedInboxTrades,
    preloadedInboxTradePriceMappings,
    preloadedOpenTradePlans,
    preloadedAccountMappings,
    preloadedPortfolios,
    preloadedCampaigns,
  ] = await Promise.all([
    preloadQuery(api.imports.listInboxTrades, {}, { token }),
    preloadQuery(api.imports.listInboxTradePriceMappings, {}, { token }),
    preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
    preloadQuery(api.campaigns.listCampaigns, {}, { token }),
  ]);

  return (
    <ImportsPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedCampaigns={preloadedCampaigns}
      preloadedInboxTradePriceMappings={preloadedInboxTradePriceMappings}
      preloadedInboxTrades={preloadedInboxTrades}
      preloadedOpenTradePlans={preloadedOpenTradePlans}
      preloadedPortfolios={preloadedPortfolios}
    />
  );
}
