export function resolveCampaignLinkage(input: {
  tradePlanId: string | null;
  tradePlanCampaignId: string | null;
  campaignId: string | null;
}): string | null {
  if (!input.tradePlanId) {
    return input.campaignId;
  }

  if (!input.tradePlanCampaignId) {
    return input.campaignId;
  }

  if (input.campaignId && input.campaignId !== input.tradePlanCampaignId) {
    throw new Error("Direct campaignId must match trade plan campaign");
  }

  return input.tradePlanCampaignId;
}

export function tradeBelongsToCampaign(input: {
  campaignId: string;
  tradeCampaignId: string | null;
  tradePlanCampaignId: string | null;
}): boolean {
  return (
    input.tradeCampaignId === input.campaignId ||
    input.tradePlanCampaignId === input.campaignId
  );
}
