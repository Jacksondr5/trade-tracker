"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, type BadgeProps } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { capitalize } from "~/lib/format";
import { cn } from "~/lib/utils";
import {
  defaultPersistedLocalHierarchyState,
  getActiveHierarchyContext,
  isCampaignRowExpanded,
  isStandaloneGroupExpanded,
  localHierarchyStorageKey,
  supportsDesktopLocalHierarchy,
  type CampaignHierarchyRow,
  type CampaignNavigationItem,
  type CampaignTradePlanHierarchy,
  type PersistedLocalHierarchyState,
  type TradePlanNavigationItem,
} from "./campaign-trade-plan-hierarchy-state";

const emptyHierarchy: CampaignTradePlanHierarchy = {
  campaigns: [],
  standaloneTradePlans: [],
  watchlist: [],
};

type WatchableItem = CampaignNavigationItem | TradePlanNavigationItem;
type GroupKey = keyof PersistedLocalHierarchyState["groups"];

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "planning":
      return "info";
    case "watching":
      return "warning";
    case "active":
      return "success";
    default:
      return "neutral";
  }
}

function isActiveItem(
  item: WatchableItem,
  activeItemType: "campaign" | "tradePlan" | null,
  activeItemId: Id<"campaigns"> | Id<"tradePlans"> | null,
): boolean {
  return item.itemType === activeItemType && item.id === activeItemId;
}

function normalizePersistedState(rawValue: string | null): PersistedLocalHierarchyState {
  if (rawValue === null) {
    return defaultPersistedLocalHierarchyState;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedLocalHierarchyState>;
    return {
      campaignRows:
        parsed.campaignRows !== undefined &&
        parsed.campaignRows !== null &&
        typeof parsed.campaignRows === "object"
          ? parsed.campaignRows
          : defaultPersistedLocalHierarchyState.campaignRows,
      groups: {
        campaigns:
          parsed.groups?.campaigns ?? defaultPersistedLocalHierarchyState.groups.campaigns,
        standaloneTradePlans:
          typeof parsed.groups?.standaloneTradePlans === "boolean"
            ? parsed.groups.standaloneTradePlans
            : defaultPersistedLocalHierarchyState.groups.standaloneTradePlans,
        watchlist:
          parsed.groups?.watchlist ?? defaultPersistedLocalHierarchyState.groups.watchlist,
      },
    };
  } catch {
    return defaultPersistedLocalHierarchyState;
  }
}

function ItemWatchButton({
  item,
  onToggle,
  pending,
}: {
  item: WatchableItem;
  onToggle: (item: WatchableItem) => void;
  pending: boolean;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      dataTestId={`toggle-watch-${item.itemType}-${item.id}`}
      aria-label={item.isWatched ? `Remove ${item.name} from Watchlist` : `Add ${item.name} to Watchlist`}
      className={cn(
        "h-8 w-8 rounded-md text-olive-10 hover:bg-olive-4 hover:text-olive-12",
        item.isWatched && "text-amber-11 hover:text-amber-12",
      )}
      disabled={pending}
      onClick={() => onToggle(item)}
    >
      <Star className={cn("h-4 w-4", item.isWatched && "fill-current")} />
    </Button>
  );
}

function HierarchyLink({
  active,
  children,
  className,
  href,
  onClick,
  parentActive = false,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  href: string;
  onClick?: () => void;
  parentActive?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 items-start rounded-lg px-3 py-2 transition-colors",
        className,
        active
          ? "bg-blue-3 text-blue-12"
          : parentActive
            ? "bg-olive-3 text-olive-12"
            : "text-olive-11 hover:bg-olive-3 hover:text-olive-12",
      )}
    >
      {children}
    </Link>
  );
}

function TradePlanRow({
  activeItemId,
  activeItemType,
  item,
  onToggleWatch,
  pending,
  showParentContext = false,
}: {
  activeItemId: Id<"campaigns"> | Id<"tradePlans"> | null;
  activeItemType: "campaign" | "tradePlan" | null;
  item: TradePlanNavigationItem;
  onToggleWatch: (item: WatchableItem) => void;
  pending: boolean;
  showParentContext?: boolean;
}) {
  const active = isActiveItem(item, activeItemType, activeItemId);

  return (
    <div className="flex items-start gap-2">
      <HierarchyLink href={item.href} active={active}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{item.name}</span>
            <Badge
              variant={getStatusVariant(item.status)}
              className="shrink-0 border-olive-6/70 bg-transparent px-1.5 py-0 text-[10px] tracking-[0.08em] text-olive-11"
            >
              {capitalize(item.status)}
            </Badge>
          </div>
          <p className="truncate text-xs text-olive-10">
            {showParentContext
              ? `${item.instrumentSymbol} • ${item.parentCampaign?.name ?? "Standalone"}`
              : item.instrumentSymbol}
          </p>
        </div>
      </HierarchyLink>
      <ItemWatchButton item={item} onToggle={onToggleWatch} pending={pending} />
    </div>
  );
}

function CampaignRow({
  activeCampaignId,
  activeItemId,
  activeItemType,
  expanded,
  item,
  onNavigateToCampaign,
  onToggleExpanded,
  onToggleWatch,
  pendingWatchIds,
}: {
  activeCampaignId: Id<"campaigns"> | null;
  activeItemId: Id<"campaigns"> | Id<"tradePlans"> | null;
  activeItemType: "campaign" | "tradePlan" | null;
  expanded: boolean;
  item: CampaignHierarchyRow;
  onNavigateToCampaign: (campaignId: Id<"campaigns">) => void;
  onToggleExpanded: (campaignId: Id<"campaigns">) => void;
  onToggleWatch: (item: WatchableItem) => void;
  pendingWatchIds: Set<string>;
}) {
  const active = isActiveItem(item, activeItemType, activeItemId);
  const parentActive = !active && item.id === activeCampaignId;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 pl-2">
        <button
          type="button"
          className={cn(
            "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-olive-10 transition-colors hover:bg-olive-4 hover:text-olive-12",
            item.tradePlans.length === 0 && "opacity-0",
          )}
          onClick={() => onToggleExpanded(item.id)}
          disabled={item.tradePlans.length === 0}
          aria-label={expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
          data-testid={`toggle-campaign-children-${item.id}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <HierarchyLink
          href={item.href}
          active={active}
          className="-ml-2"
          parentActive={parentActive}
          onClick={() => onNavigateToCampaign(item.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{item.name}</span>
              <Badge
                variant={getStatusVariant(item.status)}
                className="shrink-0 border-olive-6/70 bg-transparent px-1.5 py-0 text-[10px] tracking-[0.08em] text-olive-11"
              >
                {capitalize(item.status)}
              </Badge>
            </div>
            <p className="truncate text-xs text-olive-10">
              {item.tradePlans.length === 1 ? "1 trade plan" : `${item.tradePlans.length} trade plans`}
            </p>
          </div>
        </HierarchyLink>
        <ItemWatchButton
          item={item}
          onToggle={onToggleWatch}
          pending={pendingWatchIds.has(`${item.itemType}:${item.id}`)}
        />
      </div>

      {expanded ? (
        <div className="ml-10 space-y-1 border-l border-olive-6 pl-3">
          {item.tradePlans.length === 0 ? (
            <p className="px-3 py-1 text-xs text-olive-10">No linked trade plans.</p>
          ) : (
            item.tradePlans.map((tradePlan) => (
              <TradePlanRow
                key={tradePlan.id}
                activeItemId={activeItemId}
                activeItemType={activeItemType}
                item={tradePlan}
                onToggleWatch={onToggleWatch}
                pending={pendingWatchIds.has(`${tradePlan.itemType}:${tradePlan.id}`)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function RailGroup({
  children,
  count,
  expanded,
  onToggle,
  title,
}: {
  children: ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-medium uppercase tracking-[0.18em] text-olive-10 transition-colors hover:text-olive-12"
          onClick={onToggle}
          data-testid={`toggle-local-group-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="truncate">{title}</span>
        </button>
        <span className="text-[11px] text-olive-10">{count}</span>
      </div>
      {expanded ? children : null}
    </section>
  );
}

function DesktopLocalRail({
  activeContext,
  hierarchy,
  isLoading,
  onNavigateToCampaign,
  onToggleCampaignExpanded,
  onToggleGroup,
  onToggleWatch,
  pendingWatchIds,
  persistedState,
  watchActionError,
}: {
  activeContext: ReturnType<typeof getActiveHierarchyContext>;
  hierarchy: CampaignTradePlanHierarchy;
  isLoading: boolean;
  onNavigateToCampaign: (campaignId: Id<"campaigns">) => void;
  onToggleCampaignExpanded: (campaignId: Id<"campaigns">) => void;
  onToggleGroup: (group: GroupKey) => void;
  onToggleWatch: (item: WatchableItem) => void;
  pendingWatchIds: Set<string>;
  persistedState: PersistedLocalHierarchyState;
  watchActionError: string | null;
}) {
  const watchlistExpanded = persistedState.groups.watchlist;
  const campaignsExpanded = persistedState.groups.campaigns;
  const standaloneExpanded = isStandaloneGroupExpanded(persistedState);

  return (
    <aside className="hidden border-r border-olive-6 bg-olive-2 md:fixed md:top-0 md:left-[14.5rem] md:z-20 md:flex md:h-screen md:w-[23rem] md:flex-col">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {watchActionError ? (
              <p className="rounded-lg border border-red-8/60 bg-red-3/40 px-3 py-2 text-sm text-red-11">
                {watchActionError}
              </p>
            ) : null}

            <RailGroup
              title="Watchlist"
              count={hierarchy.watchlist.length}
              expanded={watchlistExpanded}
              onToggle={() => onToggleGroup("watchlist")}
            >
              {isLoading ? (
                <p className="px-3 py-2 text-sm text-olive-10">Loading hierarchy...</p>
              ) : hierarchy.watchlist.length === 0 ? (
                <p className="px-3 py-2 text-sm text-olive-10">No watched campaigns or trade plans.</p>
              ) : (
                <div className="space-y-1">
                  {hierarchy.watchlist.map((item) =>
                    item.itemType === "campaign" ? (
                      <div key={`watchlist-${item.itemType}-${item.id}`} className="flex items-start gap-2">
                        <HierarchyLink
                          href={item.href}
                          active={isActiveItem(item, activeContext.activeItemType, activeContext.activeItemId)}
                          parentActive={item.id === activeContext.activeCampaignId}
                          onClick={() => onNavigateToCampaign(item.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              <Badge
                                variant={getStatusVariant(item.status)}
                                className="shrink-0 border-olive-6/70 bg-transparent px-1.5 py-0 text-[10px] tracking-[0.08em] text-olive-11"
                              >
                                {capitalize(item.status)}
                              </Badge>
                            </div>
                            <p className="truncate text-xs text-olive-10">Campaign</p>
                          </div>
                        </HierarchyLink>
                        <ItemWatchButton
                          item={item}
                          onToggle={onToggleWatch}
                          pending={pendingWatchIds.has(`${item.itemType}:${item.id}`)}
                        />
                      </div>
                    ) : (
                      <TradePlanRow
                        key={`watchlist-${item.itemType}-${item.id}`}
                        activeItemId={activeContext.activeItemId}
                        activeItemType={activeContext.activeItemType}
                        item={item}
                        onToggleWatch={onToggleWatch}
                        pending={pendingWatchIds.has(`${item.itemType}:${item.id}`)}
                        showParentContext
                      />
                    ),
                  )}
                </div>
              )}
            </RailGroup>

            <RailGroup
              title="Campaigns"
              count={hierarchy.campaigns.length}
              expanded={campaignsExpanded}
              onToggle={() => onToggleGroup("campaigns")}
            >
              {isLoading ? (
                <p className="px-3 py-2 text-sm text-olive-10">Loading hierarchy...</p>
              ) : hierarchy.campaigns.length === 0 ? (
                <p className="px-3 py-2 text-sm text-olive-10">No campaigns yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {hierarchy.campaigns.map((campaign) => (
                    <CampaignRow
                      key={campaign.id}
                      activeCampaignId={activeContext.activeCampaignId}
                      activeItemId={activeContext.activeItemId}
                      activeItemType={activeContext.activeItemType}
                      expanded={isCampaignRowExpanded(
                        campaign,
                        persistedState,
                        activeContext.activeCampaignId,
                      )}
                      item={campaign}
                      onNavigateToCampaign={onNavigateToCampaign}
                      onToggleExpanded={onToggleCampaignExpanded}
                      onToggleWatch={onToggleWatch}
                      pendingWatchIds={pendingWatchIds}
                    />
                  ))}
                </div>
              )}
            </RailGroup>

            <RailGroup
              title="Standalone Trade Plans"
              count={hierarchy.standaloneTradePlans.length}
              expanded={standaloneExpanded}
              onToggle={() => onToggleGroup("standaloneTradePlans")}
            >
              {isLoading ? (
                <p className="px-3 py-2 text-sm text-olive-10">Loading hierarchy...</p>
              ) : hierarchy.standaloneTradePlans.length === 0 ? (
                <p className="px-3 py-2 text-sm text-olive-10">No standalone trade plans yet.</p>
              ) : (
                <div className="space-y-1">
                  {hierarchy.standaloneTradePlans.map((tradePlan) => (
                    <TradePlanRow
                      key={tradePlan.id}
                      activeItemId={activeContext.activeItemId}
                      activeItemType={activeContext.activeItemType}
                      item={tradePlan}
                      onToggleWatch={onToggleWatch}
                      pending={pendingWatchIds.has(`${tradePlan.itemType}:${tradePlan.id}`)}
                    />
                  ))}
                </div>
              )}
            </RailGroup>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function CampaignTradePlanHierarchyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const rawHierarchy = useQuery(api.navigation.getCampaignTradePlanHierarchy, {});
  const hierarchy = rawHierarchy ?? emptyHierarchy;
  const toggleWatchOn = useMutation(api.watchlist.watchItem);
  const toggleWatchOff = useMutation(api.watchlist.unwatchItem);

  const [persistedState, setPersistedState] = useState<PersistedLocalHierarchyState>(
    defaultPersistedLocalHierarchyState,
  );
  const [didHydrateState, setDidHydrateState] = useState(false);
  const [pendingWatchIds, setPendingWatchIds] = useState<Set<string>>(new Set());
  const [watchActionError, setWatchActionError] = useState<string | null>(null);

  const localHierarchyEnabled = supportsDesktopLocalHierarchy(pathname);

  const activeContext = useMemo(
    () => getActiveHierarchyContext(pathname, hierarchy),
    [hierarchy, pathname],
  );

  useEffect(() => {
    const rawValue = window.localStorage.getItem(localHierarchyStorageKey);
    setPersistedState(normalizePersistedState(rawValue));
    setDidHydrateState(true);
  }, []);

  useEffect(() => {
    if (!didHydrateState) {
      return;
    }

    window.localStorage.setItem(localHierarchyStorageKey, JSON.stringify(persistedState));
  }, [didHydrateState, persistedState]);

  const handleToggleGroup = (group: GroupKey) => {
    setPersistedState((currentState) => ({
      ...currentState,
      groups: {
        ...currentState.groups,
        [group]:
          group === "standaloneTradePlans"
            ? !isStandaloneGroupExpanded(currentState)
            : !currentState.groups[group],
      },
    }));
  };

  const handleToggleCampaignExpanded = (campaignId: Id<"campaigns">) => {
    setPersistedState((currentState) => ({
      ...currentState,
      campaignRows: {
        ...currentState.campaignRows,
        [campaignId]: !isCampaignRowExpanded(
          hierarchy.campaigns.find((campaign) => campaign.id === campaignId) ??
            ({
              defaultExpanded: false,
              href: "",
              id: campaignId,
              isWatched: false,
              itemType: "campaign",
              name: "",
              status: "planning",
              tradePlans: [],
            } satisfies CampaignHierarchyRow),
          currentState,
          activeContext.activeCampaignId,
        ),
      },
    }));
  };

  const handleNavigateToCampaign = (campaignId: Id<"campaigns">) => {
    setPersistedState((currentState) => ({
      ...currentState,
      campaignRows: {
        ...currentState.campaignRows,
        [campaignId]: true,
      },
    }));
  };

  const handleToggleWatch = async (item: WatchableItem) => {
    const pendingKey = `${item.itemType}:${item.id}`;

    setWatchActionError(null);
    setPendingWatchIds((currentState) => new Set(currentState).add(pendingKey));

    try {
      if (item.itemType === "campaign") {
        const payload = {
          item: {
            itemType: "campaign" as const,
            campaignId: item.id,
          },
        };

        if (item.isWatched) {
          await toggleWatchOff(payload);
        } else {
          await toggleWatchOn(payload);
        }
      } else {
        const payload = {
          item: {
            itemType: "tradePlan" as const,
            tradePlanId: item.id,
          },
        };

        if (item.isWatched) {
          await toggleWatchOff(payload);
        } else {
          await toggleWatchOn(payload);
        }
      }
    } catch (error) {
      setWatchActionError(
        error instanceof Error ? error.message : "Failed to update Watchlist state.",
      );
    } finally {
      setPendingWatchIds((currentState) => {
        const nextState = new Set(currentState);
        nextState.delete(pendingKey);
        return nextState;
      });
    }
  };

  if (!localHierarchyEnabled) {
    return <>{children}</>;
  }

  return (
    <div className="md:min-h-screen md:pl-[23rem]">
      <DesktopLocalRail
        activeContext={activeContext}
        hierarchy={hierarchy}
        isLoading={rawHierarchy === undefined}
        onNavigateToCampaign={handleNavigateToCampaign}
        onToggleCampaignExpanded={handleToggleCampaignExpanded}
        onToggleGroup={handleToggleGroup}
        onToggleWatch={handleToggleWatch}
        pendingWatchIds={pendingWatchIds}
        persistedState={persistedState}
        watchActionError={watchActionError}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
