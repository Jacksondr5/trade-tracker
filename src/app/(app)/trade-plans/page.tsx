import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import TradePlansPageClient from "./TradePlansPageClient";

export default async function TradePlansPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedTradePlans = await preloadQuery(api.tradePlans.listTradePlans, {}, { token });

  return <TradePlansPageClient preloadedTradePlans={preloadedTradePlans} />;
}
