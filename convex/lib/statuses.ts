import { v } from "convex/values";

export const CAMPAIGN_STATUSES = {
  active: "active",
  closed: "closed",
  planning: "planning",
} as const;

export const TRADE_PLAN_STATUSES = {
  active: "active",
  closed: "closed",
  idea: "idea",
  watching: "watching",
} as const;

export const campaignStatusValidator = v.union(
  v.literal(CAMPAIGN_STATUSES.active),
  v.literal(CAMPAIGN_STATUSES.closed),
  v.literal(CAMPAIGN_STATUSES.planning),
);

export const tradePlanStatusValidator = v.union(
  v.literal(TRADE_PLAN_STATUSES.active),
  v.literal(TRADE_PLAN_STATUSES.closed),
  v.literal(TRADE_PLAN_STATUSES.idea),
  v.literal(TRADE_PLAN_STATUSES.watching),
);
