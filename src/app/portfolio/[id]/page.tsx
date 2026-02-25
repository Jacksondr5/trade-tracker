import { preloadQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import PortfolioDetailPageClient from "./PortfolioDetailPageClient";

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await getConvexTokenOrThrow();
  const portfolioId = id as Id<"portfolios">;

  let preloadedPortfolioDetail;
  try {
    preloadedPortfolioDetail = await preloadQuery(
      api.portfolios.getPortfolioDetail,
      { portfolioId },
      { token },
    );
  } catch {
    notFound();
  }

  return (
    <PortfolioDetailPageClient
      portfolioId={portfolioId}
      preloadedPortfolioDetail={preloadedPortfolioDetail}
    />
  );
}
