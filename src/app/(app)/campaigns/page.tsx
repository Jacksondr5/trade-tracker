import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import CampaignsPageClient from "./CampaignsPageClient";

export default async function CampaignsPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedCampaignWorkspaceSummaries = await preloadQuery(
    api.campaigns.listCampaignWorkspaceSummaries,
    {},
    { token },
  );

  return (
    <CampaignsPageClient
      preloadedCampaignWorkspaceSummaries={preloadedCampaignWorkspaceSummaries}
    />
  );
}
