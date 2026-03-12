"use client";

import { useMutation } from "convex/react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, Button, type BadgeProps } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  getTradePlanRelationshipContextLabel,
  STANDALONE_TRADE_PLANS_LABEL,
} from "~/lib/campaign-trade-plan-navigation";
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
import { NavigationState } from "./NavigationState";
import { useNavigationData } from "./NavigationDataProvider";

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

function normalizePersistedState(
  rawValue: string | null,
): PersistedLocalHierarchyState {
  if (rawValue === null) {
    return defaultPersistedLocalHierarchyState;
  }

  try {
    const parsed = JSON.parse(
      rawValue,
    ) as Partial<PersistedLocalHierarchyState>;
    return {
      campaignRows:
        parsed.campaignRows !== undefined &&
        parsed.campaignRows !== null &&
        typeof parsed.campaignRows === "object" &&
        !Array.isArray(parsed.campaignRows)
          ? parsed.campaignRows
          : defaultPersistedLocalHierarchyState.campaignRows,
      groups: {
        campaigns:
          typeof parsed.groups?.campaigns === "boolean"
            ? parsed.groups?.campaigns
            : defaultPersistedLocalHierarchyState.groups.campaigns,
        standaloneTradePlans:
          typeof parsed.groups?.standaloneTradePlans === "boolean"
            ? parsed.groups.standaloneTradePlans
            : defaultPersistedLocalHierarchyState.groups.standaloneTradePlans,
        watchlist:
          typeof parsed.groups?.watchlist === "boolean"
            ? parsed.groups?.watchlist
            : defaultPersistedLocalHierarchyState.groups.watchlist,
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
      aria-label={
        item.isWatched
          ? `Remove ${item.name} from Watchlist`
          : `Add ${item.name} to Watchlist`
      }
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
              ? `${item.instrumentSymbol} • ${getTradePlanRelationshipContextLabel(item)}`
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
  const childPanelId = `campaign-children-${item.id}`;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 pl-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          dataTestId={`toggle-campaign-children-${item.id}`}
          className={cn(
            "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-olive-10 transition-colors hover:bg-olive-4 hover:text-olive-12",
            item.tradePlans.length === 0 && "opacity-0",
          )}
          onClick={() => onToggleExpanded(item.id)}
          disabled={item.tradePlans.length === 0}
          aria-label={
            expanded ? `Collapse ${item.name}` : `Expand ${item.name}`
          }
          aria-expanded={expanded}
          aria-controls={item.tradePlans.length > 0 ? childPanelId : undefined}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
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
              {item.tradePlans.length === 1
                ? "1 trade plan"
                : `${item.tradePlans.length} trade plans`}
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
        <div
          id={childPanelId}
          className="ml-10 space-y-1 border-l border-olive-6 pl-3"
        >
          {item.tradePlans.length === 0 ? (
            <p className="px-3 py-1 text-xs text-olive-10">
              No linked trade plans.
            </p>
          ) : (
            item.tradePlans.map((tradePlan) => (
              <TradePlanRow
                key={tradePlan.id}
                activeItemId={activeItemId}
                activeItemType={activeItemType}
                item={tradePlan}
                onToggleWatch={onToggleWatch}
                pending={pendingWatchIds.has(
                  `${tradePlan.itemType}:${tradePlan.id}`,
                )}
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
  panelId,
  title,
}: {
  children: ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          dataTestId={`toggle-local-group-${title.toLowerCase().replace(/\s+/g, "-")}`}
          className="h-auto min-w-0 justify-start gap-2 px-1 py-1 text-left text-xs font-medium tracking-[0.18em] text-olive-10 uppercase hover:bg-transparent hover:text-olive-12"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span className="truncate">{title}</span>
        </Button>
        <span className="text-[11px] text-olive-10">{count}</span>
      </div>
      {expanded ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}

function DesktopLocalRail({
  activeContext,
  hierarchy,
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
  const standaloneExpanded = isStandaloneGroupExpanded(
    persistedState,
    activeContext.isStandaloneTradePlanActive,
  );

  return (
    <aside className="hidden border-r border-olive-6 bg-olive-2 md:fixed md:top-0 md:left-[14.5rem] md:z-20 md:flex md:h-screen md:w-[23rem] md:flex-col">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {watchActionError ? (
              <Alert
                variant="error"
                className="border-red-8/60 bg-red-3/40 px-3 py-2 text-red-11"
              >
                {watchActionError}
              </Alert>
            ) : null}

            <RailGroup
              title="Watchlist"
              count={hierarchy.watchlist.length}
              expanded={watchlistExpanded}
              onToggle={() => onToggleGroup("watchlist")}
              panelId="watchlist-group-panel"
            >
              {hierarchy.watchlist.length === 0 ? (
                <NavigationState
                  title="Watchlist is empty"
                  description="Watched campaigns and trade plans will surface here for faster return navigation."
                />
              ) : (
                <div className="space-y-1">
                  {hierarchy.watchlist.map((item) =>
                    item.itemType === "campaign" ? (
                      <div
                        key={`watchlist-${item.itemType}-${item.id}`}
                        className="flex items-start gap-2"
                      >
                        <HierarchyLink
                          href={item.href}
                          active={isActiveItem(
                            item,
                            activeContext.activeItemType,
                            activeContext.activeItemId,
                          )}
                          parentActive={
                            item.id === activeContext.activeCampaignId
                          }
                          onClick={() => onNavigateToCampaign(item.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {item.name}
                              </span>
                              <Badge
                                variant={getStatusVariant(item.status)}
                                className="shrink-0 border-olive-6/70 bg-transparent px-1.5 py-0 text-[10px] tracking-[0.08em] text-olive-11"
                              >
                                {capitalize(item.status)}
                              </Badge>
                            </div>
                            <p className="truncate text-xs text-olive-10">
                              Campaign
                            </p>
                          </div>
                        </HierarchyLink>
                        <ItemWatchButton
                          item={item}
                          onToggle={onToggleWatch}
                          pending={pendingWatchIds.has(
                            `${item.itemType}:${item.id}`,
                          )}
                        />
                      </div>
                    ) : (
                      <TradePlanRow
                        key={`watchlist-${item.itemType}-${item.id}`}
                        activeItemId={activeContext.activeItemId}
                        activeItemType={activeContext.activeItemType}
                        item={item}
                        onToggleWatch={onToggleWatch}
                        pending={pendingWatchIds.has(
                          `${item.itemType}:${item.id}`,
                        )}
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
              panelId="campaigns-group-panel"
            >
              {hierarchy.campaigns.length === 0 ? (
                <NavigationState
                  title="No campaigns yet"
                  description="Create a campaign to build a reusable hierarchy for linked trade plans."
                />
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
              title={STANDALONE_TRADE_PLANS_LABEL}
              count={hierarchy.standaloneTradePlans.length}
              expanded={standaloneExpanded}
              onToggle={() => onToggleGroup("standaloneTradePlans")}
              panelId="standalone-trade-plans-group-panel"
            >
              {hierarchy.standaloneTradePlans.length === 0 ? (
                <NavigationState
                  title="No standalone trade plans yet"
                  description="Standalone plans appear here when they are created outside a campaign."
                />
              ) : (
                <div className="space-y-1">
                  {hierarchy.standaloneTradePlans.map((tradePlan) => (
                    <TradePlanRow
                      key={tradePlan.id}
                      activeItemId={activeContext.activeItemId}
                      activeItemType={activeContext.activeItemType}
                      item={tradePlan}
                      onToggleWatch={onToggleWatch}
                      pending={pendingWatchIds.has(
                        `${tradePlan.itemType}:${tradePlan.id}`,
                      )}
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
  const { hierarchy } = useNavigationData();
  const toggleWatchOn = useMutation(api.watchlist.watchItem);
  const toggleWatchOff = useMutation(api.watchlist.unwatchItem);

  const [persistedState, setPersistedState] =
    useState<PersistedLocalHierarchyState>(defaultPersistedLocalHierarchyState);
  const [didHydrateState, setDidHydrateState] = useState(false);
  const [pendingWatchIds, setPendingWatchIds] = useState<Set<string>>(
    new Set(),
  );
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

    window.localStorage.setItem(
      localHierarchyStorageKey,
      JSON.stringify(persistedState),
    );
  }, [didHydrateState, persistedState]);

  const handleToggleGroup = (group: GroupKey) => {
    setPersistedState((currentState) => ({
      ...currentState,
      groups: {
        ...currentState.groups,
        [group]:
          group === "standaloneTradePlans"
            ? !isStandaloneGroupExpanded(
                currentState,
                activeContext.isStandaloneTradePlanActive,
              )
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
        error instanceof Error
          ? error.message
          : "Failed to update Watchlist state.",
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
