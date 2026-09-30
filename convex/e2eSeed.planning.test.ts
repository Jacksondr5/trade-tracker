// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { E2E_SMOKE_FIXTURES } from "../shared/e2e/smokeFixtures";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "owner-a";

describe("instrument thread smoke fixture", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    process.env.PLAYWRIGHT_OWNER_ID = ownerId;
  });

  afterEach(() => {
    delete process.env.PLAYWRIGHT_OWNER_ID;
  });

  it("seeds the BE-shaped thread and clears it on reset", async () => {
    await t.mutation(internal.e2eSeed.setupPreviewData, {});
    const asOwner = t.withIdentity({ tokenIdentifier: ownerId });
    const fixture = E2E_SMOKE_FIXTURES.instrumentThread;

    const page = (await asOwner.query(api.threads.getThreadPage, {
      ticker: fixture.ticker,
    }))!;
    expect(page.thread.campaigns.map((campaign) => campaign.name)).toEqual([
      fixture.campaignName,
    ]);
    expect(page.history).toHaveLength(1);
    expect(page.history[0]!.episode.lifecycle).toBe("closed");
    expect(page.liveEpisodes).toHaveLength(1);

    const live = page.liveEpisodes[0]!;
    expect(live.episode.lifecycle).toBe("active");
    expect(live.position?.netQuantity).toBe(fixture.liveEpisode.quantity);
    expect(live.checkpoint?.versionNumber).toBe(1);
    expect(live.checkpoint?.endorsedBy).toBe("user");
    expect(live.itemsSinceCheckpoint.map((item) => item.status)).toEqual([
      "agreed",
      "proposed",
      "agreed",
      "proposed",
    ]);
    expect(
      live.itemsSinceCheckpoint.filter((item) => item.author === "counterpart"),
    ).toHaveLength(1);
    expect(live.openProposals.filter((item) => item.beforeCheckpoint)).toHaveLength(1);
    expect(live.history.items.some((item) => item.status === "superseded")).toBe(true);
    expect(live.campaignRules.applicable).toHaveLength(1);
    expect(live.campaignRules.exempted).toHaveLength(1);
    expect(page.notes.items).toHaveLength(1);

    const desk = await asOwner.query(api.threads.getDesk, {});
    const group = desk.groups.find((g) => g.campaign?.name === fixture.campaignName)!;
    expect(group.campaign?.benchmark?.ticker).toBe(fixture.benchmarkTicker);
    expect(group.campaign?.rules).toHaveLength(2);
    expect(group.rows.map((row) => row.episode.ticker)).toEqual([fixture.ticker]);
    expect(desk.groups[desk.groups.length - 1]?.campaign).toBeNull();

    // Seeding again is a no-op; reset removes every planning record.
    await t.mutation(internal.e2eSeed.setupPreviewData, {});
    expect(
      (await asOwner.query(api.threads.getThreadPage, { ticker: fixture.ticker }))!
        .liveEpisodes,
    ).toHaveLength(1);
    const reset = await t.mutation(internal.e2eSeed.resetPlaywrightData, {});
    expect(reset.episodesDeleted).toBeGreaterThan(0);
    expect(reset.planVersionsDeleted).toBe(1);
    expect(reset.instrumentThreadsDeleted).toBeGreaterThan(0);
    expect(
      await asOwner.query(api.threads.getThreadPage, { ticker: fixture.ticker }),
    ).toBeNull();
  });

  it("seeds a planning demo into an empty account and refuses a non-empty one", async () => {
    const demoOwner = "owner-b";
    const result = await t.mutation(internal.e2eSeed.seedPlanningDemo, { ownerId: demoOwner });
    expect(result.threads).toBeGreaterThanOrEqual(9);
    const asDemo = t.withIdentity({ tokenIdentifier: demoOwner });

    const desk = await asDemo.query(api.threads.getDesk, {});
    const semis = desk.groups.find((group) => group.campaign?.name === "Semiconductors")!;
    expect(semis.campaign?.benchmark?.ticker).toBe("SMH");
    expect(semis.rows.map((row) => row.episode.ticker).sort()).toEqual([
      "BE",
      "MU",
      "NVDA",
      "SNDK",
    ]);
    const byTicker = Object.fromEntries(semis.rows.map((row) => [row.episode.ticker, row]));
    expect(byTicker.NVDA!.episode.lifecycle).toBe("active");
    expect(byTicker.NVDA!.checkpoint?.versionNumber).toBe(1);
    expect(byTicker.NVDA!.itemsSinceCheckpoint).toHaveLength(2);
    expect(byTicker.MU!.episode.lifecycle).toBe("watching");
    expect(byTicker.SNDK!.episode.lifecycle).toBe("idea");
    expect(byTicker.BE!.draftVersionNumber).toBe(2);
    expect(byTicker.BE!.episode.campaignElementExemptions).toHaveLength(1);
    const ungrouped = desk.groups.find((group) => group.campaign === null)!;
    expect(ungrouped.rows.map((row) => row.episode.ticker).sort()).toEqual(["CF", "MSFT", "TSM"]);

    const nvda = (await asDemo.query(api.threads.getThreadPage, { ticker: "NVDA" }))!;
    expect(nvda.history).toHaveLength(1);
    expect(nvda.notes.items).toHaveLength(1);
    const amd = (await asDemo.query(api.threads.getThreadPage, { ticker: "AMD" }))!;
    expect(amd.shelvedEpisodes).toHaveLength(1);

    await expect(
      t.mutation(internal.e2eSeed.seedPlanningDemo, { ownerId: demoOwner }),
    ).rejects.toThrow(/only seeds an empty account/);
  });
});
