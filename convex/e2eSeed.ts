import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { E2E_SMOKE_FIXTURES } from "../shared/e2e/smokeFixtures";

type SmokeTradePlanFixture = (typeof E2E_SMOKE_FIXTURES)[
  | "linkedTradePlan"
  | "standaloneTradePlan"];

function getPlaywrightOwnerId(): string {
  const ownerId = process.env.PLAYWRIGHT_OWNER_ID?.trim();

  if (!ownerId) {
    throw new ConvexError(
      "PLAYWRIGHT_OWNER_ID is required to seed preview smoke data.",
    );
  }

  return ownerId;
}

async function upsertPortfolio(ctx: MutationCtx, ownerId: string) {
  const existingPortfolio = (
    await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect()
  ).find((portfolio) => portfolio.name === E2E_SMOKE_FIXTURES.portfolio.name);

  if (existingPortfolio) {
    return existingPortfolio;
  }

  const portfolioId = await ctx.db.insert("portfolios", {
    name: E2E_SMOKE_FIXTURES.portfolio.name,
    ownerId,
  });

  return (await ctx.db.get(portfolioId))!;
}

async function upsertCampaign(ctx: MutationCtx, ownerId: string) {
  const existingCampaign = (
    await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect()
  ).find((campaign) => campaign.name === E2E_SMOKE_FIXTURES.campaign.name);

  if (existingCampaign) {
    await ctx.db.patch(existingCampaign._id, {
      closedAt: undefined,
      name: E2E_SMOKE_FIXTURES.campaign.name,
      retrospective: undefined,
      status: E2E_SMOKE_FIXTURES.campaign.status,
      thesis: E2E_SMOKE_FIXTURES.campaign.thesis,
    });

    return (await ctx.db.get(existingCampaign._id))!;
  }

  const campaignId = await ctx.db.insert("campaigns", {
    closedAt: undefined,
    name: E2E_SMOKE_FIXTURES.campaign.name,
    ownerId,
    retrospective: undefined,
    status: E2E_SMOKE_FIXTURES.campaign.status,
    thesis: E2E_SMOKE_FIXTURES.campaign.thesis,
  });

  return (await ctx.db.get(campaignId))!;
}

async function upsertAuxiliaryCampaign(
  ctx: MutationCtx,
  args: {
    fixture:
      | (typeof E2E_SMOKE_FIXTURES)["planningCampaign"]
      | (typeof E2E_SMOKE_FIXTURES)["closedCampaign"];
    ownerId: string;
  },
) {
  const closedAt = Date.parse("2026-02-18T00:00:00.000Z");
  const existingCampaign = (
    await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect()
  ).find((campaign) => campaign.name === args.fixture.name);

  const patch = {
    closedAt: args.fixture.status === "closed" ? closedAt : undefined,
    name: args.fixture.name,
    retrospective:
      "retrospective" in args.fixture ? args.fixture.retrospective : undefined,
    status: args.fixture.status,
    thesis: args.fixture.thesis,
  };

  if (existingCampaign) {
    await ctx.db.patch(existingCampaign._id, patch);
    return (await ctx.db.get(existingCampaign._id))!;
  }

  const campaignId = await ctx.db.insert("campaigns", {
    ...patch,
    ownerId: args.ownerId,
  });

  return (await ctx.db.get(campaignId))!;
}

async function upsertTradePlan(
  ctx: MutationCtx,
  args: {
    campaignId?: Id<"campaigns">;
    fixture: SmokeTradePlanFixture;
    ownerId: string;
  },
) {
  const existingTradePlan = (
    await ctx.db
      .query("tradePlans")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect()
  ).find((tradePlan) => tradePlan.name === args.fixture.name);

  const patch = {
    campaignId: args.campaignId,
    closedAt: undefined,
    instrumentSymbol: args.fixture.instrumentSymbol,
    invalidatedAt: undefined,
    name: args.fixture.name,
    rationale: undefined,
    sortOrder: args.fixture.sortOrder,
    status: args.fixture.status,
  };

  if (existingTradePlan) {
    await ctx.db.patch(existingTradePlan._id, patch);
    return (await ctx.db.get(existingTradePlan._id))!;
  }

  const tradePlanId = await ctx.db.insert("tradePlans", {
    ...patch,
    ownerId: args.ownerId,
  });

  return (await ctx.db.get(tradePlanId))!;
}

async function ensureWatchlistItem(
  ctx: MutationCtx,
  args:
    | {
        campaignId: Id<"campaigns">;
        itemType: "campaign";
        ownerId: string;
      }
    | {
        itemType: "tradePlan";
        ownerId: string;
        tradePlanId: Id<"tradePlans">;
      },
) {
  const existingWatch =
    args.itemType === "campaign"
      ? await ctx.db
          .query("watchlist")
          .withIndex("by_owner_campaignId", (q) =>
            q.eq("ownerId", args.ownerId).eq("campaignId", args.campaignId),
          )
          .unique()
      : await ctx.db
          .query("watchlist")
          .withIndex("by_owner_tradePlanId", (q) =>
            q.eq("ownerId", args.ownerId).eq("tradePlanId", args.tradePlanId),
          )
          .unique();

  if (existingWatch) {
    return;
  }

  await ctx.db.insert("watchlist", {
    campaignId: args.itemType === "campaign" ? args.campaignId : undefined,
    itemType: args.itemType,
    ownerId: args.ownerId,
    tradePlanId: args.itemType === "tradePlan" ? args.tradePlanId : undefined,
    watchedAt: Date.now(),
  });
}

async function upsertTrade(
  ctx: MutationCtx,
  args: {
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    trade: (typeof E2E_SMOKE_FIXTURES.trades)[number];
    tradePlanId: Id<"tradePlans">;
  },
) {
  const existingTrade = (
    await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect()
  ).find((trade) => trade.notes === args.trade.notes);

  const patch = {
    assetType: args.trade.assetType,
    date: args.trade.date,
    direction: args.trade.direction,
    notes: args.trade.notes,
    ownerId: args.ownerId,
    portfolioId: args.portfolioId,
    price: args.trade.price,
    quantity: args.trade.quantity,
    side: args.trade.side,
    source: "manual" as const,
    ticker: args.trade.ticker,
    tradePlanId: args.tradePlanId,
  };

  if (existingTrade) {
    await ctx.db.patch(existingTrade._id, patch);
    return (await ctx.db.get(existingTrade._id))!;
  }

  const tradeId = await ctx.db.insert("trades", patch);
  return (await ctx.db.get(tradeId))!;
}

export const setupPreviewData = internalMutation({
  args: {},
  returns: v.object({
    campaignId: v.id("campaigns"),
    linkedTradePlanId: v.id("tradePlans"),
    portfolioId: v.id("portfolios"),
    standaloneTradePlanId: v.id("tradePlans"),
  }),
  handler: async (ctx) => {
    const ownerId = getPlaywrightOwnerId();
    const portfolio = await upsertPortfolio(ctx, ownerId);
    const campaign = await upsertCampaign(ctx, ownerId);
    await upsertAuxiliaryCampaign(ctx, {
      fixture: E2E_SMOKE_FIXTURES.planningCampaign,
      ownerId,
    });
    await upsertAuxiliaryCampaign(ctx, {
      fixture: E2E_SMOKE_FIXTURES.closedCampaign,
      ownerId,
    });
    const linkedTradePlan = await upsertTradePlan(ctx, {
      campaignId: campaign._id,
      fixture: E2E_SMOKE_FIXTURES.linkedTradePlan,
      ownerId,
    });
    const standaloneTradePlan = await upsertTradePlan(ctx, {
      fixture: E2E_SMOKE_FIXTURES.standaloneTradePlan,
      ownerId,
    });

    await ensureWatchlistItem(ctx, {
      campaignId: campaign._id,
      itemType: "campaign",
      ownerId,
    });
    await ensureWatchlistItem(ctx, {
      itemType: "tradePlan",
      ownerId,
      tradePlanId: standaloneTradePlan._id,
    });

    for (const trade of E2E_SMOKE_FIXTURES.trades) {
      await upsertTrade(ctx, {
        ownerId,
        portfolioId: trade.portfolio === "shared" ? portfolio._id : undefined,
        trade,
        tradePlanId:
          trade.tradePlan === "linked"
            ? linkedTradePlan._id
            : standaloneTradePlan._id,
      });
    }

    return {
      campaignId: campaign._id,
      linkedTradePlanId: linkedTradePlan._id,
      portfolioId: portfolio._id,
      standaloneTradePlanId: standaloneTradePlan._id,
    };
  },
});

export const resetPlaywrightData = internalMutation({
  args: {},
  returns: v.object({
    accountMappingsDeleted: v.number(),
    campaignsDeleted: v.number(),
    inboxTradesDeleted: v.number(),
    notesDeleted: v.number(),
    portfoliosDeleted: v.number(),
    strategyDocsDeleted: v.number(),
    tradePlansDeleted: v.number(),
    tradesDeleted: v.number(),
    watchlistDeleted: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = getPlaywrightOwnerId();
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const inboxTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const tradePlans = await ctx.db
      .query("tradePlans")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const portfolios = await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const accountMappings = await ctx.db
      .query("accountMappings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const strategyDocs = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    for (const doc of notes) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of watchlistItems) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of inboxTrades) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of trades) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of tradePlans) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of campaigns) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of portfolios) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of accountMappings) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of strategyDocs) {
      await ctx.db.delete(doc._id);
    }

    return {
      accountMappingsDeleted: accountMappings.length,
      campaignsDeleted: campaigns.length,
      inboxTradesDeleted: inboxTrades.length,
      notesDeleted: notes.length,
      portfoliosDeleted: portfolios.length,
      strategyDocsDeleted: strategyDocs.length,
      tradePlansDeleted: tradePlans.length,
      tradesDeleted: trades.length,
      watchlistDeleted: watchlistItems.length,
    };
  },
});
