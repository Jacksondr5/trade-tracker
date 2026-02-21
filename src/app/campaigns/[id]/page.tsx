import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import CampaignDetailPageClient from "./CampaignDetailPageClient";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignId = id as Id<"campaigns">;

  const token = await getConvexTokenOrThrow();
  const [preloadedCampaign, preloadedCampaignNotes, preloadedTradePlans, preloadedAllTrades, preloadedCampaignPL] =
    await Promise.all([
      preloadQuery(api.campaigns.getCampaign, { campaignId }, { token }),
      preloadQuery(api.campaignNotes.getNotesByCampaign, { campaignId }, { token }),
      preloadQuery(api.tradePlans.listTradePlansByCampaign, { campaignId }, { token }),
      preloadQuery(api.trades.listTrades, {}, { token }),
      preloadQuery(api.campaigns.getCampaignPL, { campaignId }, { token }),
    ]);

  return (
    <CampaignDetailPageClient
      campaignId={campaignId}
      preloadedAllTrades={preloadedAllTrades}
      preloadedCampaign={preloadedCampaign}
      preloadedCampaignNotes={preloadedCampaignNotes}
      preloadedCampaignPL={preloadedCampaignPL}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
