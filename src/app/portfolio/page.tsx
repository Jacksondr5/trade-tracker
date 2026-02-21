import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import PortfolioPageClient from "./PortfolioPageClient";

export default async function PortfolioPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedSnapshots = await preloadQuery(
    api.portfolioSnapshots.listSnapshots,
    {},
    { token },
  );

  return <PortfolioPageClient preloadedSnapshots={preloadedSnapshots} />;
}
