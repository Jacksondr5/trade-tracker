export function buildReviewedTradePatch(input: {
  tradePlanId: string | null;
  campaignId: string | null;
}): {
  tradePlanId?: string;
  campaignId?: string;
  inboxStatus: "reviewed";
} {
  return {
    campaignId: input.campaignId ?? undefined,
    inboxStatus: "reviewed",
    tradePlanId: input.tradePlanId ?? undefined,
  };
}
