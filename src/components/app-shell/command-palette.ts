import {
  getTradePlanRelationshipContextLabel,
  getTradePlanRelationshipLabel,
} from "../../lib/campaign-trade-plan-navigation";

export interface CommandPaletteCampaignItem {
  href: string;
  id: string;
  isWatched: boolean;
  itemType: "campaign";
  name: string;
  status: string;
}

export interface CommandPaletteParentCampaign {
  href: string;
  id: string;
  name: string;
}

export interface CommandPaletteTradePlanItem {
  href: string;
  id: string;
  instrumentSymbol: string;
  isWatched: boolean;
  itemType: "tradePlan";
  name: string;
  parentCampaign: CommandPaletteParentCampaign | null;
  status: string;
}

export interface CommandPaletteCampaignRow extends CommandPaletteCampaignItem {
  defaultExpanded: boolean;
  tradePlans: CommandPaletteTradePlanItem[];
}

export interface CommandPaletteHierarchy {
  campaigns: CommandPaletteCampaignRow[];
  standaloneTradePlans: CommandPaletteTradePlanItem[];
  watchlist: Array<CommandPaletteCampaignItem | CommandPaletteTradePlanItem>;
}

export interface CommandPaletteItem {
  contextLabel: string;
  href: string;
  id: string;
  instrumentSymbol: string | null;
  isWatched: boolean;
  itemType: "campaign" | "tradePlan";
  name: string;
  searchText: string;
  statusLabel: string;
}

export interface CommandPaletteSections {
  campaigns: CommandPaletteItem[];
  tradePlans: CommandPaletteItem[];
  watchlist: CommandPaletteItem[];
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function createSearchText(parts: Array<string | null | undefined>): string {
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

function createCommandPaletteItem(
  item: CommandPaletteCampaignItem | CommandPaletteTradePlanItem,
): CommandPaletteItem {
  if (item.itemType === "campaign") {
    return {
      contextLabel: "Campaign",
      href: item.href,
      id: item.id,
      instrumentSymbol: null,
      isWatched: item.isWatched,
      itemType: item.itemType,
      name: item.name,
      searchText: createSearchText([item.name, "campaign"]),
      statusLabel: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    };
  }

  return {
    contextLabel: `${item.instrumentSymbol} • ${getTradePlanRelationshipContextLabel(item)}`,
    href: item.href,
    id: item.id,
    instrumentSymbol: item.instrumentSymbol,
    isWatched: item.isWatched,
    itemType: item.itemType,
    name: item.name,
    searchText: createSearchText([
      item.name,
      item.instrumentSymbol,
      item.parentCampaign?.name,
      getTradePlanRelationshipLabel(item),
      getTradePlanRelationshipContextLabel(item),
      "trade plan",
    ]),
    statusLabel: item.status.charAt(0).toUpperCase() + item.status.slice(1),
  };
}

function itemKey(item: { id: string; itemType: "campaign" | "tradePlan" }) {
  return `${item.itemType}:${item.id}`;
}

export function buildCommandPaletteSections(
  hierarchy: CommandPaletteHierarchy,
): CommandPaletteSections {
  const watchlist = hierarchy.watchlist.map(createCommandPaletteItem);
  const watchedKeys = new Set(watchlist.map(itemKey));

  const campaigns = hierarchy.campaigns
    .filter((campaign) => !watchedKeys.has(itemKey(campaign)))
    .map(createCommandPaletteItem);

  const tradePlans = [
    ...hierarchy.campaigns.flatMap((campaign) => campaign.tradePlans),
    ...hierarchy.standaloneTradePlans,
  ]
    .filter((tradePlan) => !watchedKeys.has(itemKey(tradePlan)))
    .map(createCommandPaletteItem);

  return {
    campaigns,
    tradePlans,
    watchlist,
  };
}

export function filterCommandPaletteSections(
  sections: CommandPaletteSections,
  query: string,
): CommandPaletteSections {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return sections;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const matchesQuery = (item: CommandPaletteItem) =>
    queryTokens.every((token) => item.searchText.includes(token));

  return {
    campaigns: sections.campaigns.filter(matchesQuery),
    tradePlans: sections.tradePlans.filter(matchesQuery),
    watchlist: sections.watchlist.filter(matchesQuery),
  };
}

export function hasCommandPaletteResults(
  sections: CommandPaletteSections,
): boolean {
  return (
    sections.watchlist.length > 0 ||
    sections.campaigns.length > 0 ||
    sections.tradePlans.length > 0
  );
}
