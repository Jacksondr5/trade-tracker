import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { E2E_SMOKE_FIXTURES } from "../shared/e2e/smokeFixtures";
import { emptyPlanSections } from "./lib/planModel";
import {
  draftPlanVersion,
  endorsePlanVersion,
  ensureThread,
  openEpisode,
  recordElements,
  setCampaignLinks,
  setEpisodeCampaign,
  shelveEpisode,
  syncTradeEpisodeLink,
} from "./lib/planWrites";

type SmokeTradePlanFixture = (typeof E2E_SMOKE_FIXTURES)[
  | "linkedTradePlan"
  | "standaloneTradePlan"];

type SeedTradeFixture = {
  assetType: "crypto" | "stock";
  date: number;
  direction: "long" | "short";
  fixtureKey: string;
  portfolio: "shared" | undefined;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
  tradePlan: "linked" | "standalone";
};

function getPlaywrightOwnerId(): string {
  const ownerId = process.env.PLAYWRIGHT_OWNER_ID?.trim();

  if (!ownerId) {
    throw new ConvexError(
      "PLAYWRIGHT_OWNER_ID is required to seed preview smoke data.",
    );
  }

  return ownerId;
}

async function upsertResolvedMarketDataInstrument(
  ctx: MutationCtx,
  args: {
    assetType: "crypto" | "stock";
    ownerId: string;
    symbol: string;
  },
) {
  const symbol = args.symbol.trim().toUpperCase();
  const existing = await ctx.db
    .query("marketDataInstruments")
    .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
      q
        .eq("ownerId", args.ownerId)
        .eq("assetType", args.assetType)
        .eq("symbol", symbol),
    )
    .unique();
  const now = Date.now();
  const resolution = {
    lastError: undefined,
    lastResolvedAt: now,
    providerSymbol: symbol,
    resolutionStatus: "resolved" as const,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, resolution);
    return;
  }

  await ctx.db.insert("marketDataInstruments", {
    assetType: args.assetType,
    createdAt: now,
    ownerId: args.ownerId,
    provider: "twelve_data",
    symbol,
    ...resolution,
  });
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
      status: E2E_SMOKE_FIXTURES.campaign.status,
      thesis: E2E_SMOKE_FIXTURES.campaign.thesis,
    });

    return (await ctx.db.get(existingCampaign._id))!;
  }

  const campaignId = await ctx.db.insert("campaigns", {
    closedAt: undefined,
    name: E2E_SMOKE_FIXTURES.campaign.name,
    ownerId,
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
    status: args.fixture.status,
    thesis: args.fixture.thesis,
  };

  let campaign;
  if (existingCampaign) {
    await ctx.db.patch(existingCampaign._id, patch);
    campaign = (await ctx.db.get(existingCampaign._id))!;
  } else {
    const campaignId = await ctx.db.insert("campaigns", {
      ...patch,
      ownerId: args.ownerId,
    });
    campaign = (await ctx.db.get(campaignId))!;
  }

  // Upsert retrospective if fixture provides one
  if ("retrospective" in args.fixture && args.fixture.retrospective) {
    const existingRetro = await ctx.db
      .query("retrospectives")
      .withIndex("by_owner_parent", (q) =>
        q.eq("ownerId", args.ownerId).eq("parentId", campaign._id),
      )
      .unique();

    if (existingRetro) {
      await ctx.db.patch(existingRetro._id, {
        content: args.fixture.retrospective,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("retrospectives", {
        content: args.fixture.retrospective,
        ownerId: args.ownerId,
        parentId: campaign._id,
        parentKind: "campaign",
        updatedAt: Date.now(),
      });
    }
  }

  return campaign;
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
    trade: SeedTradeFixture;
  },
) {
  const existingTrade = (
    await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect()
  ).find(
    (trade) =>
      trade.ticker === args.trade.ticker && trade.date === args.trade.date,
  );

  const patch = {
    assetType: args.trade.assetType,
    date: args.trade.date,
    direction: args.trade.direction,
    ownerId: args.ownerId,
    portfolioId: args.portfolioId,
    price: args.trade.price,
    quantity: args.trade.quantity,
    side: args.trade.side,
    source: "manual" as const,
    ticker: args.trade.ticker,
  };

  if (existingTrade) {
    await ctx.db.patch(existingTrade._id, patch);
    await syncTradeEpisodeLink(ctx, existingTrade._id);
    return (await ctx.db.get(existingTrade._id))!;
  }

  const tradeId = await ctx.db.insert("trades", patch);
  await syncTradeEpisodeLink(ctx, tradeId);
  return (await ctx.db.get(tradeId))!;
}

async function upsertInboxTrade(
  ctx: MutationCtx,
  args: {
    assetType: "crypto" | "stock";
    brokerageAccountId?: string;
    date: number;
    direction: "long" | "short";
    externalId: string;
    ownerId: string;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    source: "ibkr" | "kraken";
    ticker: string;
  },
) {
  const existingTrade = await ctx.db
    .query("inboxTrades")
    .withIndex("by_owner_source_externalId", (q) =>
      q
        .eq("ownerId", args.ownerId)
        .eq("source", args.source)
        .eq("externalId", args.externalId),
    )
    .unique();

  const patch = {
    assetType: args.assetType,
    brokerageAccountId: args.brokerageAccountId,
    date: args.date,
    direction: args.direction,
    externalId: args.externalId,
    ownerId: args.ownerId,
    price: args.price,
    quantity: args.quantity,
    side: args.side,
    source: args.source,
    status: "pending_review" as const,
    ticker: args.ticker,
    validationErrors: [],
    validationWarnings: [],
  };

  if (existingTrade) {
    await ctx.db.patch(existingTrade._id, patch);
    return (await ctx.db.get(existingTrade._id))!;
  }

  const inboxTradeId = await ctx.db.insert("inboxTrades", patch);
  return (await ctx.db.get(inboxTradeId))!;
}

async function upsertBrokerageConnection(ctx: MutationCtx, ownerId: string) {
  const fixture = E2E_SMOKE_FIXTURES.brokerageConnection;
  const existing = await ctx.db
    .query("brokerageConnections")
    .withIndex("by_ownerId_and_source", (q) =>
      q.eq("ownerId", ownerId).eq("source", "ibkr"),
    )
    .unique();
  const now = Date.now();
  const patch = {
    connectionError: undefined,
    expectedAccountIds: [...fixture.expectedAccountIds],
    label: fixture.label,
    ownerId,
    queryId: fixture.queryId,
    source: "ibkr" as const,
    status: "needs_setup" as const,
    tokenExpiresAt: fixture.tokenExpiresAt,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return (await ctx.db.get(existing._id))!;
  }
  const connectionId = await ctx.db.insert("brokerageConnections", {
    ...patch,
    createdAt: now,
  });
  return (await ctx.db.get(connectionId))!;
}

/**
 * One realistic instrument thread modeled on the September BE case: a closed
 * prior episode, a live campaign episode with an endorsed checkpoint,
 * superseded history, agreed and proposed items after the checkpoint, an open
 * counterpart proposal from before it, and one campaign exemption.
 */
async function seedInstrumentThreadFixture(
  ctx: MutationCtx,
  args: { ownerId: string; portfolioId: Id<"portfolios"> },
) {
  const fixture = E2E_SMOKE_FIXTURES.instrumentThread;
  const { ownerId } = args;
  const thread = await ensureThread(ctx, ownerId, fixture.ticker, "system");
  const existingEpisodes = await ctx.db
    .query("episodes")
    .withIndex("by_owner_threadId", (q) =>
      q.eq("ownerId", ownerId).eq("threadId", thread._id),
    )
    .collect();
  if (existingEpisodes.length > 0) return;

  const campaignId = await ctx.db.insert("campaigns", {
    name: fixture.campaignName,
    ownerId,
    status: "active",
    thesis: fixture.campaignThesis,
  });
  await setCampaignLinks(ctx, {
    actor: "counterpart",
    benchmarkTicker: fixture.benchmarkTicker,
    campaignId,
    linkedTickers: [fixture.ticker],
    ownerId,
  });
  const [gateId] = await recordElements(ctx, {
    actor: "counterpart",
    elements: [
      {
        asOf: "2026-09-08",
        author: "user",
        kind: "rule",
        statement:
          "Adds require sector confirmation on E2ESMH and a credible higher support",
        status: "agreed",
      },
      {
        asOf: "2026-09-04",
        author: "user",
        kind: "scenario",
        statement:
          "S4: E2ESMH breaks the weekly channel, exit anticipatory positions first",
        status: "agreed",
      },
    ],
    ownerId,
    scope: { campaignId, kind: "campaign" },
    source: "conversation",
  });
  await ctx.db.insert("notes", {
    campaignId,
    content: "E2E campaign note: the three largest names are 38% of the benchmark.",
    noteDate: Date.parse("2026-09-06T15:00:00.000Z"),
    ownerId,
  });
  await ctx.db.insert("notes", {
    content:
      "E2EBE is a data center energy play; price has never fought around the long-term channel line.",
    noteDate: Date.parse("2026-09-09T14:10:00.000Z"),
    ownerId,
    threadId: thread._id,
    ticker: fixture.ticker,
  });

  const seedTrade = async (trade: {
    date: number;
    price: number;
    quantity: number;
    side: "buy" | "sell";
  }) =>
    upsertTrade(ctx, {
      ownerId,
      portfolioId: args.portfolioId,
      trade: {
        assetType: "stock",
        date: trade.date,
        direction: "long",
        fixtureKey: `instrument-thread-${trade.date}`,
        portfolio: "shared",
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        ticker: fixture.ticker,
        tradePlan: "standalone",
      },
    });

  // Closed prior episode: opened and flattened by fills alone.
  await seedTrade({
    date: fixture.closedEpisode.entryDate,
    price: 180,
    quantity: 20,
    side: "buy",
  });
  await seedTrade({
    date: fixture.closedEpisode.exitDate,
    price: 195,
    quantity: 20,
    side: "sell",
  });

  const episode = await openEpisode(ctx, {
    actor: "counterpart",
    openedAt: fixture.liveEpisode.openedAt,
    ownerId,
    portfolioId: args.portfolioId,
    source: "user",
    threadId: thread._id,
    ticker: fixture.ticker,
  });
  await setEpisodeCampaign(ctx, {
    campaignId,
    episodeId: episode._id,
    exemptedCampaignElementIds: [gateId!],
    ownerId,
  });
  const usd = (amount: number) =>
    ({
      amount,
      provenance: "user_reported" as const,
      scope: "per_share" as const,
      unit: "usd" as const,
    });
  const [entryId] = await recordElements(ctx, {
    actor: "counterpart",
    elements: [
      {
        author: "user",
        kind: "entry",
        statement:
          "Continuation after reclaiming the long-term channel ceiling (Top LT)",
        status: "agreed",
      },
    ],
    ownerId,
    scope: { episodeId: episode._id, kind: "episode" },
    source: "conversation",
  });
  const [firstStopId] = await recordElements(ctx, {
    actor: "counterpart",
    elements: [
      {
        asOf: "2026-09-09",
        author: "user",
        kind: "stop",
        statement: "Broker backstop $240, without thinking about it much yet",
        status: "proposed",
        value: { ...usd(240), stopKind: "broker_order" },
      },
    ],
    ownerId,
    scope: { episodeId: episode._id, kind: "episode" },
    source: "conversation",
  });
  const [stopId, targetId, sizeId] = await recordElements(ctx, {
    actor: "counterpart",
    elements: [
      {
        asOf: "2026-09-09",
        author: "user",
        kind: "stop",
        statement:
          "Immediate exit on a touch of the 4h line near $240; Top LT near $255 is discretionary",
        status: "agreed",
        supersedes: firstStopId!,
        value: { ...usd(240), stopKind: "planned_exit" },
      },
      {
        asOf: "2026-09-09",
        author: "user",
        kind: "target",
        statement: "$346 prior all-time high as the reference target",
        status: "agreed",
        value: usd(346),
      },
      {
        asOf: "2026-09-09",
        author: "user",
        kind: "size",
        statement: "Take the 3% size: 17 shares",
        status: "agreed",
        value: {
          amount: 17,
          provenance: "user_reported",
          scope: "position",
          unit: "shares",
        },
      },
      {
        asOf: "2026-09-09",
        author: "counterpart",
        kind: "analysis",
        statement: "2.16R to $346 from $273.51 with a $240 stop (illustrative)",
        status: "proposed",
        value: {
          amount: 2.16,
          provenance: "hypothetical",
          scope: "position",
          unit: "ratio",
        },
      },
    ],
    ownerId,
    scope: { episodeId: episode._id, kind: "episode" },
    source: "conversation",
  });
  await seedTrade({
    date: fixture.liveEpisode.fillDate,
    price: 273.355,
    quantity: fixture.liveEpisode.quantity,
    side: "buy",
  });
  await draftPlanVersion(ctx, {
    actor: "counterpart",
    endorsed: false,
    episodeId: episode._id,
    ownerId,
    sections: {
      ...emptyPlanSections(),
      entry: [
        {
          asOf: "2026-09-09",
          elementId: entryId!,
          text: "Filled 17 @ 273.36 after the Top LT reclaim",
        },
      ],
      scenarios: [
        { text: "Exempt from the E2ESMH gate; has its own breakout confirmation" },
        { text: "S4 on E2ESMH applies: exit first if the weekly channel breaks" },
      ],
      size: [{ asOf: "2026-09-09", elementId: sizeId!, text: "3% allocation, 17 shares" }],
      stop: [
        {
          asOf: "2026-09-09",
          elementId: stopId!,
          text: "$240 hard exit; Top LT ~$255 discretionary",
          value: { ...usd(240), stopKind: "planned_exit" },
        },
      ],
      structure: [
        { asOf: "2026-09-09", text: "Long-term channel ceiling (Top LT) ~$255" },
      ],
      targets: [
        { asOf: "2026-09-09", elementId: targetId!, text: "$346 prior ATH", value: usd(346) },
      ],
    },
    source: "conversation",
  });
  await endorsePlanVersion(ctx, {
    actor: "counterpart",
    episodeId: episode._id,
    ownerId,
    versionNumber: 1,
  });
  await recordElements(ctx, {
    actor: "counterpart",
    elements: [
      {
        asOf: "2026-09-14",
        author: "user",
        kind: "state",
        statement:
          "Sep 14 intraday undercut of Top LT then reclaim; within tolerance, hold",
        status: "agreed",
      },
      {
        asOf: "2026-09-18",
        author: "counterpart",
        kind: "analysis",
        statement:
          "Breakout and retest confirmed; R/R 3.10 using Top LT vs 1.65 using $240",
        status: "proposed",
        value: {
          amount: 3.1,
          provenance: "hypothetical",
          scope: "position",
          unit: "ratio",
        },
      },
      {
        asOf: "2026-09-18",
        author: "user",
        kind: "decision",
        statement: "No 100% add; a 100% add feels too high risk here",
        status: "agreed",
      },
      {
        asOf: "2026-09-18",
        author: "user",
        kind: "add",
        statement: "50% add (8 to 9 shares) remains possible, lower on the list",
        status: "proposed",
        value: {
          amount: 8,
          provenance: "hypothetical",
          scope: "position",
          unit: "shares",
        },
      },
    ],
    ownerId,
    scope: { episodeId: episode._id, kind: "episode" },
    source: "conversation",
  });
}

export const getInstrumentThreadFixtureIds = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      campaignId: v.id("campaigns"),
      checkpointVersionNumber: v.number(),
      closedEpisodeId: v.id("episodes"),
      liveEpisodeId: v.id("episodes"),
      ticker: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = getPlaywrightOwnerId();
    const fixture = E2E_SMOKE_FIXTURES.instrumentThread;
    const thread = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner_ticker", (q) =>
        q.eq("ownerId", ownerId).eq("ticker", fixture.ticker),
      )
      .unique();
    if (!thread) return null;
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_owner_threadId", (q) =>
        q.eq("ownerId", ownerId).eq("threadId", thread._id),
      )
      .collect();
    const live = episodes.find((episode) => episode.lifecycle !== "closed");
    const closed = episodes.find((episode) => episode.lifecycle === "closed");
    if (!live?.campaignId || !closed || !live.currentPlanVersionId) return null;
    const checkpoint = await ctx.db.get(live.currentPlanVersionId);
    if (!checkpoint) return null;
    return {
      campaignId: live.campaignId,
      checkpointVersionNumber: checkpoint.versionNumber,
      closedEpisodeId: closed._id,
      liveEpisodeId: live._id,
      ticker: fixture.ticker,
    };
  },
});

export const getThreadEpisodeIds = internalQuery({
  args: { ticker: v.string() },
  returns: v.object({ episodeIds: v.array(v.id("episodes")) }),
  handler: async (ctx, args) => {
    const ownerId = getPlaywrightOwnerId();
    const thread = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner_ticker", (q) =>
        q.eq("ownerId", ownerId).eq("ticker", args.ticker.trim().toUpperCase()),
      )
      .unique();
    if (!thread) return { episodeIds: [] };
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_owner_threadId", (q) =>
        q.eq("ownerId", ownerId).eq("threadId", thread._id),
      )
      .collect();
    return { episodeIds: episodes.map((episode) => episode._id) };
  },
});

export const getEpisodeElementIds = internalQuery({
  args: { episodeId: v.id("episodes") },
  returns: v.object({ elementIds: v.array(v.id("planElements")) }),
  handler: async (ctx, args) => {
    const ownerId = getPlaywrightOwnerId();
    const elements = await ctx.db
      .query("planElements")
      .withIndex("by_owner_episodeId_revision", (q) =>
        q.eq("ownerId", ownerId).eq("episodeId", args.episodeId),
      )
      .collect();
    return { elementIds: elements.map((element) => element._id) };
  },
});

const demoDate = (iso: string) => Date.parse(`${iso}T15:00:00.000Z`);
const usdPerShare = (amount: number, stopKind?: "planned_exit" | "broker_order") => ({
  amount,
  provenance: "user_reported" as const,
  scope: "per_share" as const,
  unit: "usd" as const,
  ...(stopKind ? { stopKind } : {}),
});

/**
 * Seeds a realistic planning workspace for one owner so a preview can be
 * explored by hand: a campaign with a benchmark and rules, active episodes
 * with checkpoints and later items, a watching setup, an idea, a shelved
 * idea, a pending draft, closed history, and thread notes. All numbers are
 * synthetic. Refuses to run for an owner who already has trades or threads,
 * so it can never mix into real data.
 */
export const seedPlanningDemo = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({ episodes: v.number(), threads: v.number() }),
  handler: async (ctx, args) => {
    const { ownerId } = args;
    const existingTrade = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    const existingThread = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    if (existingTrade || existingThread) {
      throw new ConvexError(
        "Owner already has trades or threads; the demo only seeds an empty account.",
      );
    }

    const swing = await ctx.db.insert("portfolios", { name: "Swing", ownerId });
    const longTerm = await ctx.db.insert("portfolios", {
      name: "Long-term",
      ownerId,
    });

    const fill = async (trade: {
      date: string;
      portfolioId: Id<"portfolios">;
      price: number;
      quantity: number;
      side: "buy" | "sell";
      ticker: string;
    }) => {
      const tradeId = await ctx.db.insert("trades", {
        assetType: "stock",
        date: demoDate(trade.date),
        direction: "long",
        ownerId,
        portfolioId: trade.portfolioId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        source: "ibkr",
        ticker: trade.ticker,
      });
      await syncTradeEpisodeLink(ctx, tradeId);
      return tradeId;
    };
    const note = async (ticker: string, date: string, content: string) => {
      const thread = await ensureThread(ctx, ownerId, ticker, "counterpart");
      await ctx.db.insert("notes", {
        content,
        noteDate: demoDate(date),
        ownerId,
        threadId: thread._id,
        ticker,
      });
    };
    const episodeOf = async (tradeId: Id<"trades">) =>
      (await ctx.db.get(tradeId))!.episodeId!;
    const record = (
      episodeId: Id<"episodes">,
      elements: Parameters<typeof recordElements>[1]["elements"],
    ) =>
      recordElements(ctx, {
        actor: "counterpart",
        elements,
        ownerId,
        scope: { episodeId, kind: "episode" },
        source: "conversation",
      });
    const checkpoint = async (
      episodeId: Id<"episodes">,
      sections: Partial<ReturnType<typeof emptyPlanSections>>,
      endorse: boolean,
    ) => {
      const version = await draftPlanVersion(ctx, {
        actor: "counterpart",
        endorsed: false,
        episodeId,
        ownerId,
        sections: { ...emptyPlanSections(), ...sections },
        source: "conversation",
      });
      if (endorse) {
        await endorsePlanVersion(ctx, {
          actor: "counterpart",
          episodeId,
          ownerId,
          versionNumber: version.versionNumber,
        });
      }
      return version;
    };

    // Campaign with a benchmark thread and rules.
    const campaignId = await ctx.db.insert("campaigns", {
      name: "Semiconductors",
      ownerId,
      status: "active",
      thesis:
        "The sector is cooling and reforming. Small anticipatory entries until SMH confirms, then build.",
    });
    await setCampaignLinks(ctx, {
      actor: "counterpart",
      benchmarkTicker: "SMH",
      campaignId,
      linkedTickers: ["NVDA", "MU", "BE", "SNDK"],
      ownerId,
    });
    const [confirmRuleId] = await recordElements(ctx, {
      actor: "counterpart",
      elements: [
        {
          author: "user",
          kind: "rule",
          statement:
            "Adds require SMH to confirm on a daily close and a higher support on the name itself",
          status: "agreed",
        },
        {
          author: "user",
          kind: "scenario",
          statement:
            "If SMH breaks its weekly channel, exit anticipatory positions first, then review NVDA",
          status: "agreed",
        },
        {
          author: "counterpart",
          kind: "rule",
          statement:
            "Consider capping combined sector giveback near 2% of equity",
          status: "proposed",
        },
      ],
      ownerId,
      scope: { campaignId, kind: "campaign" },
      source: "conversation",
    });
    await note(
      "SMH",
      "2026-09-04",
      "Approaching a cluster of trendlines; the weekly channel floor is the line that matters.",
    );

    // NVDA: a closed swing earlier in the summer, then a live one with a
    // checkpoint and decisions recorded after it.
    await fill({ date: "2026-06-02", portfolioId: swing, price: 150, quantity: 20, side: "buy", ticker: "NVDA" });
    await fill({ date: "2026-07-14", portfolioId: swing, price: 172, quantity: 20, side: "sell", ticker: "NVDA" });
    const nvdaBuy = await fill({ date: "2026-09-10", portfolioId: swing, price: 180, quantity: 25, side: "buy", ticker: "NVDA" });
    const nvda = await episodeOf(nvdaBuy);
    await setEpisodeCampaign(ctx, { campaignId, episodeId: nvda, ownerId });
    const [nvdaEntry, nvdaStop] = await record(nvda, [
      { author: "user", kind: "entry", statement: "Reclaimed the weekly channel; starter on the retest", status: "agreed" },
      { asOf: "2026-09-10", author: "user", kind: "stop", statement: "Broker stop $166 under the weekly line", status: "agreed", value: usdPerShare(166, "broker_order") },
      { asOf: "2026-09-10", author: "user", kind: "target", statement: "$210 measured move from the base", status: "agreed", value: usdPerShare(210) },
      { asOf: "2026-09-10", author: "counterpart", kind: "analysis", statement: "2.1R to $210 from $180 with the $166 stop (illustrative)", status: "proposed" },
    ]);
    await checkpoint(
      nvda,
      {
        entry: [{ asOf: "2026-09-10", elementId: nvdaEntry, text: "Filled 25 @ 180 on the weekly-channel retest" }],
        scenarios: [{ text: "SMH breaks its weekly channel: review NVDA after the anticipatory names" }],
        size: [{ asOf: "2026-09-10", text: "3% starter, 25 shares" }],
        stop: [{ asOf: "2026-09-10", elementId: nvdaStop, text: "$166 broker stop under the weekly line", value: usdPerShare(166, "broker_order") }],
        structure: [{ asOf: "2026-09-10", text: "Weekly channel floor ~$168, sloping up" }],
        targets: [{ asOf: "2026-09-10", text: "$210 measured move", value: usdPerShare(210) }],
      },
      true,
    );
    await record(nvda, [
      { asOf: "2026-09-18", author: "user", kind: "state", statement: "Held the retest; no change to the plan", status: "agreed" },
      { asOf: "2026-09-22", author: "counterpart", kind: "add", statement: "Add 10 on a close above $192 if SMH confirms", status: "proposed", value: { amount: 10, provenance: "hypothetical", scope: "position", unit: "shares" } },
    ]);
    await note("NVDA", "2026-09-15", "Has recovered from this kind of breakdown before; false breaks below the weekly line have stayed within about 5%.");

    // BE: active, exempt from the confirmation rule, with a newer draft
    // waiting for endorsement.
    const beBuy = await fill({ date: "2026-09-09", portfolioId: swing, price: 270, quantity: 15, side: "buy", ticker: "BE" });
    const be = await episodeOf(beBuy);
    await setEpisodeCampaign(ctx, {
      campaignId,
      episodeId: be,
      exemptedCampaignElementIds: [confirmRuleId!],
      ownerId,
    });
    const [beEntry] = await record(be, [
      { author: "user", kind: "entry", statement: "Breakout over the long-term channel ceiling", status: "agreed" },
      { asOf: "2026-09-09", author: "user", kind: "stop", statement: "Hard exit $240; channel line ~$255 is discretionary", status: "agreed", value: usdPerShare(240, "planned_exit") },
      { author: "user", kind: "rule", statement: "Own breakout confirmation; does not wait for SMH", status: "agreed" },
    ]);
    await checkpoint(
      be,
      {
        entry: [{ asOf: "2026-09-09", elementId: beEntry, text: "Filled 15 @ 270 on the breakout" }],
        scenarios: [{ text: "Exempt from the SMH confirmation rule" }],
        size: [{ asOf: "2026-09-09", text: "3% position, 15 shares" }],
        stop: [{ asOf: "2026-09-09", text: "$240 hard exit; channel ~$255 discretionary", value: usdPerShare(240, "planned_exit") }],
        targets: [{ asOf: "2026-09-09", text: "$340 prior high", value: usdPerShare(340) }],
      },
      true,
    );
    await checkpoint(
      be,
      {
        entry: [{ asOf: "2026-09-09", text: "Filled 15 @ 270 on the breakout" }],
        scenarios: [{ text: "Exempt from the SMH confirmation rule" }],
        size: [{ asOf: "2026-09-24", text: "3% position; 50% add possible on a retest" }],
        stop: [{ asOf: "2026-09-24", text: "Raise hard exit to $252 under the retest low", value: usdPerShare(252, "planned_exit") }],
        targets: [{ asOf: "2026-09-09", text: "$340 prior high", value: usdPerShare(340) }],
      },
      false,
    );
    await note("BE", "2026-09-09", "Data center power play; price rarely lingers around the long-term channel line.");

    // MU: watching, with an agreed entry and an endorsed plan, no fills yet.
    const muThread = await ensureThread(ctx, ownerId, "MU", "counterpart");
    const mu = (
      await openEpisode(ctx, {
        actor: "counterpart",
        openedAt: demoDate("2026-09-21"),
        ownerId,
        portfolioId: swing,
        source: "user",
        threadId: muThread._id,
        ticker: "MU",
      })
    )._id;
    await setEpisodeCampaign(ctx, { campaignId, episodeId: mu, ownerId });
    await record(mu, [
      { asOf: "2026-09-21", author: "user", kind: "entry", statement: "Enter on a convincing breakout of $1,020", status: "agreed", value: usdPerShare(1020) },
      { asOf: "2026-09-21", author: "user", kind: "stop", statement: "Planning stop $875", status: "agreed", value: usdPerShare(875, "planned_exit") },
      { author: "user", kind: "condition", statement: "No trade before earnings; decide on holding through once other candidates are clear", status: "proposed" },
    ]);
    await checkpoint(
      mu,
      {
        entry: [{ asOf: "2026-09-21", text: "Breakout over $1,020", value: usdPerShare(1020) }],
        stop: [{ asOf: "2026-09-21", text: "$875 planning stop", value: usdPerShare(875, "planned_exit") }],
        targets: [{ asOf: "2026-09-21", text: "$1,210 prior high, then $1,400 pattern objective" }],
      },
      true,
    );

    // SNDK: an idea with only exploration so far.
    const sndkThread = await ensureThread(ctx, ownerId, "SNDK", "counterpart");
    const sndk = (
      await openEpisode(ctx, {
        actor: "counterpart",
        openedAt: demoDate("2026-09-21"),
        ownerId,
        source: "user",
        threadId: sndkThread._id,
        ticker: "SNDK",
      })
    )._id;
    await setEpisodeCampaign(ctx, { campaignId, episodeId: sndk, ownerId });
    await record(sndk, [
      { author: "user", kind: "decision", statement: "Future candidate; wait for a new structure before planning", status: "agreed" },
      { asOf: "2026-09-21", author: "counterpart", kind: "analysis", statement: "Horizontal zones: resistance $1,800–1,850, support $1,500–1,550", status: "proposed" },
    ]);

    // AMD: an idea that was shelved.
    const amdThread = await ensureThread(ctx, ownerId, "AMD", "counterpart");
    const amd = (
      await openEpisode(ctx, {
        actor: "counterpart",
        openedAt: demoDate("2026-09-17"),
        ownerId,
        source: "user",
        threadId: amdThread._id,
        ticker: "AMD",
      })
    )._id;
    await record(amd, [
      { author: "user", kind: "state", statement: "May have missed the move; not chasing", status: "agreed" },
    ]);
    await shelveEpisode(ctx, {
      actor: "counterpart",
      episodeId: amd,
      ownerId,
      shelved: true,
      source: "conversation",
    });

    // Bare positions: fills only, no planning, including a long-term holding.
    await fill({ date: "2026-08-20", portfolioId: swing, price: 150, quantity: 12, side: "buy", ticker: "TSM" });
    await fill({ date: "2025-03-11", portfolioId: longTerm, price: 380, quantity: 10, side: "buy", ticker: "MSFT" });
    await fill({ date: "2026-05-04", portfolioId: longTerm, price: 55, quantity: 40, side: "buy", ticker: "CF" });

    const threads = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(100);
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(100);
    return { episodes: episodes.length, threads: threads.length };
  },
});

export const setupPreviewData = internalMutation({
  args: {},
  returns: v.object({
    brokerageConnectionId: v.id("brokerageConnections"),
    campaignId: v.id("campaigns"),
    linkedTradePlanId: v.id("tradePlans"),
    portfolioId: v.id("portfolios"),
    standaloneTradePlanId: v.id("tradePlans"),
  }),
  handler: async (ctx) => {
    const ownerId = getPlaywrightOwnerId();
    const brokerageConnection = await upsertBrokerageConnection(ctx, ownerId);
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
      });
    }
    await seedInstrumentThreadFixture(ctx, {
      ownerId,
      portfolioId: portfolio._id,
    });

    return {
      brokerageConnectionId: brokerageConnection._id,
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
    brokerageConnectionSecretsDeleted: v.number(),
    brokerageConnectionsDeleted: v.number(),
    campaignsDeleted: v.number(),
    counterpartOperationsDeleted: v.number(),
    episodesDeleted: v.number(),
    inboxTradesDeleted: v.number(),
    instrumentThreadsDeleted: v.number(),
    marketDataInstrumentsDeleted: v.number(),
    retrospectivesDeleted: v.number(),
    notesDeleted: v.number(),
    planElementsDeleted: v.number(),
    planVersionsDeleted: v.number(),
    portfoliosDeleted: v.number(),
    revisionCountersDeleted: v.number(),
    strategyDocsDeleted: v.number(),
    tradePlansDeleted: v.number(),
    tradesDeleted: v.number(),
    watchlistDeleted: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = getPlaywrightOwnerId();
    const brokerageConnections = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    const brokerageConnectionSecrets = (
      await Promise.all(
        brokerageConnections.map((connection) =>
          ctx.db
            .query("brokerageConnectionSecrets")
            .withIndex("by_connectionId", (q) =>
              q.eq("connectionId", connection._id),
            )
            .unique(),
        ),
      )
    ).filter((secret) => secret !== null);
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
    const marketDataInstruments = await ctx.db
      .query("marketDataInstruments")
      .withIndex("by_ownerId_and_resolutionStatus", (q) =>
        q.eq("ownerId", ownerId),
      )
      .collect();
    const retrospectives = await ctx.db
      .query("retrospectives")
      .withIndex("by_owner_parent", (q) => q.eq("ownerId", ownerId))
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
    const planElements = await ctx.db
      .query("planElements")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const planVersions = (
      await Promise.all(
        episodes.map((episode) =>
          ctx.db
            .query("planVersions")
            .withIndex("by_owner_episodeId_versionNumber", (q) =>
              q.eq("ownerId", ownerId).eq("episodeId", episode._id),
            )
            .collect(),
        ),
      )
    ).flat();
    const instrumentThreads = await ctx.db
      .query("instrumentThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const counterpartOperations = await ctx.db
      .query("counterpartOperations")
      .withIndex("by_owner_operationId", (q) => q.eq("ownerId", ownerId))
      .collect();
    const revisionCounters = await ctx.db
      .query("revisionCounters")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    for (const doc of [
      ...planVersions,
      ...planElements,
      ...episodes,
      ...instrumentThreads,
      ...counterpartOperations,
      ...revisionCounters,
    ]) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of brokerageConnectionSecrets) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of brokerageConnections) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of notes) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of watchlistItems) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of inboxTrades) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of marketDataInstruments) {
      await ctx.db.delete(doc._id);
    }
    for (const doc of retrospectives) {
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
      brokerageConnectionSecretsDeleted: brokerageConnectionSecrets.length,
      brokerageConnectionsDeleted: brokerageConnections.length,
      campaignsDeleted: campaigns.length,
      counterpartOperationsDeleted: counterpartOperations.length,
      episodesDeleted: episodes.length,
      instrumentThreadsDeleted: instrumentThreads.length,
      planElementsDeleted: planElements.length,
      planVersionsDeleted: planVersions.length,
      revisionCountersDeleted: revisionCounters.length,
      inboxTradesDeleted: inboxTrades.length,
      marketDataInstrumentsDeleted: marketDataInstruments.length,
      notesDeleted: notes.length,
      portfoliosDeleted: portfolios.length,
      retrospectivesDeleted: retrospectives.length,
      strategyDocsDeleted: strategyDocs.length,
      tradePlansDeleted: tradePlans.length,
      tradesDeleted: trades.length,
      watchlistDeleted: watchlistItems.length,
    };
  },
});

export const setBrokerageSyncWarningFixture = internalMutation({
  args: {
    state: v.union(v.literal("persisted"), v.literal("unset")),
  },
  returns: v.union(v.literal("persisted"), v.literal("unset")),
  handler: async (ctx, args) => {
    const ownerId = getPlaywrightOwnerId();
    const connection = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId_and_source", (q) =>
        q.eq("ownerId", ownerId).eq("source", "ibkr"),
      )
      .unique();
    if (!connection?.queryId) {
      throw new ConvexError(
        "Playwright brokerage connection with a query ID is not seeded.",
      );
    }
    const queryId = connection.queryId;

    const fixture = E2E_SMOKE_FIXTURES.brokerageSyncWarning;
    const existing = await ctx.db
      .query("brokerageSyncRuns")
      .withIndex(
        "by_connectionId_and_reportType_and_reportDate_and_queryId",
        (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("reportType", "activity")
            .eq("reportDate", fixture.reportDate)
            .eq("queryId", queryId),
      )
      .unique();

    if (args.state === "unset") {
      if (existing) await ctx.db.delete(existing._id);
      return args.state;
    }

    const now = Date.now();
    const patch = {
      completedAt: now,
      importedTrades: 0,
      ownerId,
      positionSnapshotCount: 0,
      reconciliationIssueCount: 0,
      requestedAt: now,
      skippedDuplicateTrades: 0,
      skippedLogicalDuplicateTrades: 0,
      source: "ibkr" as const,
      startedAt: now,
      status: "succeeded" as const,
      updatedAt: now,
      warnings: [fixture.message],
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("brokerageSyncRuns", {
        ...patch,
        connectionId: connection._id,
        queryId,
        reportDate: fixture.reportDate,
        reportType: "activity",
      });
    }

    return args.state;
  },
});

export const setBrokerageConnectionMetadataFixture = internalMutation({
  args: {
    state: v.union(v.literal("persisted"), v.literal("unset")),
  },
  returns: v.union(v.literal("persisted"), v.literal("unset")),
  handler: async (ctx, args) => {
    const ownerId = getPlaywrightOwnerId();
    const connection = await ctx.db
      .query("brokerageConnections")
      .withIndex("by_ownerId_and_source", (q) =>
        q.eq("ownerId", ownerId).eq("source", "ibkr"),
      )
      .unique();
    if (!connection) {
      throw new ConvexError("Playwright brokerage connection is not seeded.");
    }
    const fixture = E2E_SMOKE_FIXTURES.brokerageConnection;
    await ctx.db.patch(connection._id, {
      expectedAccountIds:
        args.state === "persisted"
          ? [...fixture.expectedAccountIds]
          : undefined,
      label: args.state === "persisted" ? fixture.label : undefined,
      tokenExpiresAt:
        args.state === "persisted" ? fixture.tokenExpiresAt : undefined,
      updatedAt: Date.now(),
    });
    return args.state;
  },
});

export const seedTradePlanInboxScenarios = internalMutation({
  args: {
    linkedTradePlanId: v.id("tradePlans"),
    scope: v.string(),
    standaloneTradePlanId: v.id("tradePlans"),
  },
  returns: v.object({
    linkedSuggestedExternalId: v.string(),
    standaloneAssignedExternalId: v.string(),
  }),
  handler: async (ctx, args) => {
    const ownerId = getPlaywrightOwnerId();
    const linkedTradePlan = await ctx.db.get(args.linkedTradePlanId);
    const standaloneTradePlan = await ctx.db.get(args.standaloneTradePlanId);

    if (
      linkedTradePlan === null ||
      linkedTradePlan.ownerId !== ownerId ||
      standaloneTradePlan === null ||
      standaloneTradePlan.ownerId !== ownerId
    ) {
      throw new ConvexError("Trade plan not found for inbox seed setup.");
    }

    const linkedSuggestedExternalId = `${args.scope}-${E2E_SMOKE_FIXTURES.inboxTrades.linkedSuggested.fixtureKey}`;
    const standaloneAssignedExternalId = `${args.scope}-${E2E_SMOKE_FIXTURES.inboxTrades.standaloneAssigned.fixtureKey}`;
    const linkedAssetType = "stock" as const;
    const standaloneAssetType = "crypto" as const;

    await upsertResolvedMarketDataInstrument(ctx, {
      assetType: linkedAssetType,
      ownerId,
      symbol: linkedTradePlan.instrumentSymbol,
    });
    await upsertResolvedMarketDataInstrument(ctx, {
      assetType: standaloneAssetType,
      ownerId,
      symbol: standaloneTradePlan.instrumentSymbol,
    });

    await upsertInboxTrade(ctx, {
      assetType: linkedAssetType,
      brokerageAccountId: "playwright-linked-account",
      date: E2E_SMOKE_FIXTURES.inboxTrades.linkedSuggested.date,
      direction: "long",
      externalId: linkedSuggestedExternalId,
      ownerId,
      price: 44.25,
      quantity: 8,
      side: "buy",
      source: "ibkr",
      ticker: linkedTradePlan.instrumentSymbol,
    });

    await upsertInboxTrade(ctx, {
      assetType: standaloneAssetType,
      brokerageAccountId: "playwright-standalone-account",
      date: E2E_SMOKE_FIXTURES.inboxTrades.standaloneAssigned.date,
      direction: "short",
      externalId: standaloneAssignedExternalId,
      ownerId,
      price: 97500,
      quantity: 0.75,
      side: "sell",
      source: "kraken",
      ticker: standaloneTradePlan.instrumentSymbol,
    });

    return {
      linkedSuggestedExternalId,
      standaloneAssignedExternalId,
    };
  },
});
