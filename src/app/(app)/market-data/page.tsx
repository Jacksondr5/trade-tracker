import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import MarketDataPageClient from "./MarketDataPageClient";

export default async function MarketDataPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedInstruments = await preloadQuery(
    api.marketData.listInstruments,
    {},
    { token },
  );

  return <MarketDataPageClient preloadedInstruments={preloadedInstruments} />;
}
