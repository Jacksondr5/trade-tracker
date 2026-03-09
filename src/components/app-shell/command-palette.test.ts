import { describe, expect, it } from "vitest";
import {
  buildCommandPaletteSections,
  filterCommandPaletteSections,
  hasCommandPaletteResults,
  type CommandPaletteHierarchy,
} from "./command-palette";

const hierarchy: CommandPaletteHierarchy = {
  watchlist: [
    {
      href: "/campaigns/campaign-1",
      id: "campaign-1",
      isWatched: true,
      itemType: "campaign",
      name: "Macro Rotation",
      status: "active",
    },
    {
      href: "/trade-plans/plan-1",
      id: "plan-1",
      instrumentSymbol: "URNM",
      isWatched: true,
      itemType: "tradePlan",
      name: "Core Entry",
      parentCampaign: {
        href: "/campaigns/campaign-1",
        id: "campaign-1",
        name: "Macro Rotation",
      },
      status: "watching",
    },
  ],
  campaigns: [
    {
      defaultExpanded: true,
      href: "/campaigns/campaign-1",
      id: "campaign-1",
      isWatched: true,
      itemType: "campaign",
      name: "Macro Rotation",
      status: "active",
      tradePlans: [
        {
          href: "/trade-plans/plan-1",
          id: "plan-1",
          instrumentSymbol: "URNM",
          isWatched: true,
          itemType: "tradePlan",
          name: "Core Entry",
          parentCampaign: {
            href: "/campaigns/campaign-1",
            id: "campaign-1",
            name: "Macro Rotation",
          },
          status: "watching",
        },
        {
          href: "/trade-plans/plan-2",
          id: "plan-2",
          instrumentSymbol: "URA",
          isWatched: false,
          itemType: "tradePlan",
          name: "Core Entry",
          parentCampaign: {
            href: "/campaigns/campaign-1",
            id: "campaign-1",
            name: "Macro Rotation",
          },
          status: "idea",
        },
      ],
    },
    {
      defaultExpanded: false,
      href: "/campaigns/campaign-2",
      id: "campaign-2",
      isWatched: false,
      itemType: "campaign",
      name: "Semiconductor Catch-Up",
      status: "planning",
      tradePlans: [],
    },
  ],
  standaloneTradePlans: [
    {
      href: "/trade-plans/plan-3",
      id: "plan-3",
      instrumentSymbol: "ARKK",
      isWatched: false,
      itemType: "tradePlan",
      name: "Short ARKK",
      parentCampaign: null,
      status: "active",
    },
  ],
};

describe("command palette helpers", () => {
  it("keeps watched items in a dedicated section and removes duplicates from base groups", () => {
    const sections = buildCommandPaletteSections(hierarchy);

    expect(sections.watchlist.map((item) => item.name)).toEqual([
      "Macro Rotation",
      "Core Entry",
    ]);
    expect(sections.campaigns.map((item) => item.name)).toEqual([
      "Semiconductor Catch-Up",
    ]);
    expect(sections.tradePlans.map((item) => item.id)).toEqual([
      "plan-2",
      "plan-3",
    ]);
  });

  it("adds parent and standalone context for trade-plan disambiguation", () => {
    const sections = buildCommandPaletteSections(hierarchy);

    expect(sections.tradePlans).toMatchObject([
      {
        contextLabel: "URA • Macro Rotation",
        id: "plan-2",
        statusLabel: "Idea",
      },
      {
        contextLabel: "ARKK • Standalone",
        id: "plan-3",
        statusLabel: "Active",
      },
    ]);
  });

  it("filters by name, symbol, and parent campaign context", () => {
    const sections = buildCommandPaletteSections(hierarchy);

    expect(
      filterCommandPaletteSections(sections, "macro ura").tradePlans,
    ).toMatchObject([
      {
        id: "plan-2",
      },
    ]);
    expect(
      filterCommandPaletteSections(sections, "arkk").tradePlans,
    ).toMatchObject([
      {
        id: "plan-3",
      },
    ]);
    expect(
      filterCommandPaletteSections(sections, "semiconductor").campaigns,
    ).toMatchObject([
      {
        id: "campaign-2",
      },
    ]);
  });

  it("reports when no command-palette results remain", () => {
    const sections = buildCommandPaletteSections(hierarchy);

    expect(
      hasCommandPaletteResults(filterCommandPaletteSections(sections, "zzzz")),
    ).toBe(false);
  });
});
