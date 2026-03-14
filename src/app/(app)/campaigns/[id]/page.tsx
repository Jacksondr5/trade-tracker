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
  const [
    preloadedCampaign,
    preloadedCampaignWorkspace,
    preloadedCampaignNotes,
    preloadedCampaignTrades,
    preloadedAccountMappings,
  ] =
    await Promise.all([
      preloadQuery(api.campaigns.getCampaign, { campaignId }, { token }),
      preloadQuery(api.campaigns.getCampaignWorkspace, { campaignId }, { token }),
      preloadQuery(api.notes.getNotesByCampaign, { campaignId }, { token }),
      preloadQuery(api.trades.listTradesByCampaign, { campaignId }, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <CampaignDetailPageClient
      campaignId={campaignId}
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedCampaignTrades={preloadedCampaignTrades}
      preloadedCampaign={preloadedCampaign}
      preloadedCampaignWorkspace={preloadedCampaignWorkspace}
      preloadedCampaignNotes={preloadedCampaignNotes}
    />
  );
}
