import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import StrategyPageClient from "./StrategyPageClient";

export default async function StrategyPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedDoc = await preloadQuery(
    api.strategyDoc.get,
    {},
    { token },
  );

  return <StrategyPageClient preloadedDoc={preloadedDoc} />;
}
