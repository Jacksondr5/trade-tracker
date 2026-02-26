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
  const [preloadedCampaign, preloadedCampaignNotes, preloadedTradePlans, preloadedAllTrades, preloadedCampaignPL, preloadedAccountMappings] =
    await Promise.all([
      preloadQuery(api.campaigns.getCampaign, { campaignId }, { token }),
      preloadQuery(api.notes.getNotesByCampaign, { campaignId }, { token }),
      preloadQuery(api.tradePlans.listTradePlansByCampaign, { campaignId }, { token }),
      preloadQuery(api.trades.listTrades, {}, { token }),
      preloadQuery(api.campaigns.getCampaignPL, { campaignId }, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <CampaignDetailPageClient
      campaignId={campaignId}
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedAllTrades={preloadedAllTrades}
      preloadedCampaign={preloadedCampaign}
      preloadedCampaignNotes={preloadedCampaignNotes}
      preloadedCampaignPL={preloadedCampaignPL}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
