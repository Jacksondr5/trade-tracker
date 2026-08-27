import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ImportsPageClient from "./ImportsPageClient";

export default async function ImportsPage() {
  const token = await getConvexTokenOrThrow();
  const [
    preloadedInboxTrades,
    preloadedInboxTradePriceMappings,
    preloadedAccountMappings,
    preloadedBrokerageIngestionStatus,
    preloadedPortfolios,
  ] = await Promise.all([
    preloadQuery(api.imports.listInboxTrades, {}, { token }),
    preloadQuery(api.imports.listInboxTradePriceMappings, {}, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(
      api.brokerageIngestion.getBrokerageIngestionStatus,
      {},
      { token },
    ),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  ]);

  return (
    <ImportsPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedBrokerageIngestionStatus={preloadedBrokerageIngestionStatus}
      preloadedInboxTradePriceMappings={preloadedInboxTradePriceMappings}
      preloadedInboxTrades={preloadedInboxTrades}
      preloadedPortfolios={preloadedPortfolios}
    />
  );
}
