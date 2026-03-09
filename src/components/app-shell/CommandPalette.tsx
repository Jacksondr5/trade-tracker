"use client";

import { useQuery } from "convex/react";
import { Map, SquareChartGantt, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import {
  buildCommandPaletteSections,
  filterCommandPaletteSections,
  hasCommandPaletteResults,
} from "./command-palette";

function CommandPaletteResult({
  contextLabel,
  isWatched,
  name,
  statusLabel,
}: {
  contextLabel: string;
  isWatched: boolean;
  name: string;
  statusLabel: string;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-olive-11">{contextLabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11px] tracking-[0.18em] text-olive-10 uppercase">
        {isWatched ? (
          <Star
            className="h-3.5 w-3.5 fill-amber-9 text-amber-9"
            aria-label="Watchlist"
          />
        ) : null}
        <span>{statusLabel}</span>
      </div>
    </>
  );
}

export function CommandPalette({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const hierarchy = useQuery(api.navigation.getCampaignTradePlanHierarchy, {});
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  const sections = useMemo(() => {
    if (hierarchy === undefined) {
      return null;
    }

    return buildCommandPaletteSections(hierarchy);
  }, [hierarchy]);

  const filteredSections = useMemo(() => {
    if (sections === null) {
      return null;
    }

    return filterCommandPaletteSections(sections, deferredSearchQuery);
  }, [deferredSearchQuery, sections]);

  const hasResults =
    filteredSections !== null && hasCommandPaletteResults(filteredSections);

  const emptyMessage =
    hierarchy === undefined
      ? "Loading campaigns and trade plans..."
      : deferredSearchQuery
        ? "No matching campaigns or trade plans."
        : "No campaigns or trade plans yet.";

  const handleSelect = (href: string) => {
    flushSync(() => {
      onOpenChange(false);
    });
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to campaign or trade plan"
      description="Search campaigns and trade plans by name, symbol, or parent campaign."
      className="top-[20vh] w-[min(42rem,calc(100vw-1.5rem))] translate-y-0"
      commandProps={{ loop: true, shouldFilter: false }}
    >
      <CommandInput
        autoFocus
        dataTestId="command-palette-input"
        placeholder="Jump to a campaign or trade plan..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[min(60vh,28rem)]">
        {hasResults ? null : <CommandEmpty>{emptyMessage}</CommandEmpty>}

        {filteredSections?.watchlist.length ? (
          <CommandGroup heading="Watchlist">
            {filteredSections.watchlist.map((item) => (
              <CommandItem
                key={`${item.itemType}:${item.id}`}
                dataTestId={`command-palette-watchlist-${item.itemType}-${item.id}`}
                value={item.searchText}
                onSelect={() => handleSelect(item.href)}
              >
                {item.itemType === "campaign" ? (
                  <Map className="text-olive-11" />
                ) : (
                  <SquareChartGantt className="text-olive-11" />
                )}
                <CommandPaletteResult
                  contextLabel={item.contextLabel}
                  isWatched={item.isWatched}
                  name={item.name}
                  statusLabel={item.statusLabel}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {filteredSections?.campaigns.length ? (
          <CommandGroup heading="Campaigns">
            {filteredSections.campaigns.map((item) => (
              <CommandItem
                key={`${item.itemType}:${item.id}`}
                dataTestId={`command-palette-campaign-${item.id}`}
                value={item.searchText}
                onSelect={() => handleSelect(item.href)}
              >
                <Map className="text-olive-11" />
                <CommandPaletteResult
                  contextLabel={item.contextLabel}
                  isWatched={item.isWatched}
                  name={item.name}
                  statusLabel={item.statusLabel}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {filteredSections?.tradePlans.length ? (
          <CommandGroup heading="Trade Plans">
            {filteredSections.tradePlans.map((item) => (
              <CommandItem
                key={`${item.itemType}:${item.id}`}
                dataTestId={`command-palette-trade-plan-${item.id}`}
                value={item.searchText}
                onSelect={() => handleSelect(item.href)}
              >
                <SquareChartGantt className="text-olive-11" />
                <CommandPaletteResult
                  contextLabel={item.contextLabel}
                  isWatched={item.isWatched}
                  name={item.name}
                  statusLabel={item.statusLabel}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
