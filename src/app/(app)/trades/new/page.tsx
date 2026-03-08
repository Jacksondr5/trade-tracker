import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import NewTradePageClient from "./NewTradePageClient";

export default async function NewTradePage() {
  const token = await getConvexTokenOrThrow();
  const [preloadedOpenTradePlans, preloadedPortfolios] = await Promise.all([
    preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  ]);

  return (
    <NewTradePageClient
      preloadedOpenTradePlans={preloadedOpenTradePlans}
      preloadedPortfolios={preloadedPortfolios}
    />
  );
}
