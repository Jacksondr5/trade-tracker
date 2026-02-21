import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import NewTradePageClient from "./NewTradePageClient";

export default async function NewTradePage() {
  const token = await getConvexTokenOrThrow();
  const preloadedOpenTradePlans = await preloadQuery(
    api.tradePlans.listOpenTradePlans,
    {},
    { token },
  );

  return <NewTradePageClient preloadedOpenTradePlans={preloadedOpenTradePlans} />;
}
