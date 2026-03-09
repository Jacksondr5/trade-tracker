"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { capitalize } from "~/lib/format";
import {
  type BreadcrumbSegment,
  type CampaignNavigationItem,
  type CampaignTradePlanHierarchy,
  type TradePlanNavigationItem,
} from "~/lib/campaign-trade-plan-navigation";
import { cn } from "~/lib/utils";

function isHierarchyItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getCampaignMeta(item: CampaignNavigationItem): string {
  return capitalize(item.status);
}

function getTradePlanMeta(item: TradePlanNavigationItem): string {
  return `${item.instrumentSymbol} • ${capitalize(item.status)}`;
}

function getWatchlistMeta(
  item: CampaignNavigationItem | TradePlanNavigationItem,
): string {
  if (item.itemType === "campaign") {
    return getCampaignMeta(item);
  }

  const parentLabel = item.parentCampaign?.name ?? "Standalone";
  return `${parentLabel} • ${getTradePlanMeta(item)}`;
}

function HierarchyLink({
  href,
  isActive,
  meta,
  onNavigate,
  title,
  tone = "default",
}: {
  href: string;
  isActive: boolean;
  meta?: string;
  onNavigate?: () => void;
  title: string;
  tone?: "default" | "nested";
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "block rounded-lg px-3 py-2 transition-colors",
        tone === "nested" ? "ml-4" : undefined,
        isActive
          ? "bg-blue-3 text-blue-12"
          : "text-olive-11 hover:bg-olive-3 hover:text-olive-12",
      )}
    >
      <p className="truncate text-sm font-medium">{title}</p>
      {meta ? <p className="truncate text-xs text-olive-10">{meta}</p> : null}
    </Link>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h3 className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-olive-10">
      {title}
    </h3>
  );
}

export function CampaignTradePlanHierarchyNavigation({
  hierarchy,
  onNavigate,
  pathname,
}: {
  hierarchy: CampaignTradePlanHierarchy;
  onNavigate?: () => void;
  pathname: string;
}) {
  return (
    <div className="space-y-6 border-t border-olive-6 pt-5">
      <div className="space-y-1 px-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-olive-10">
          Local hierarchy
        </p>
        <p className="text-xs text-olive-10">
          Browse watched items, campaigns, and standalone trade plans.
        </p>
      </div>

      <nav aria-label="Campaign and trade plan hierarchy" className="space-y-5">
        <section className="space-y-2">
          <SectionHeading title="Watchlist" />
          <div className="space-y-1">
            {hierarchy.watchlist.length === 0 ? (
              <p className="px-3 text-sm text-olive-10">Nothing watched yet.</p>
            ) : (
              hierarchy.watchlist.map((item) => (
                <HierarchyLink
                  key={`${item.itemType}-${item.id}`}
                  href={item.href}
                  isActive={isHierarchyItemActive(pathname, item.href)}
                  meta={getWatchlistMeta(item)}
                  onNavigate={onNavigate}
                  title={item.name}
                />
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <SectionHeading title="Campaigns" />
          <div className="space-y-2">
            {hierarchy.campaigns.length === 0 ? (
              <p className="px-3 text-sm text-olive-10">No campaigns yet.</p>
            ) : (
              hierarchy.campaigns.map((campaign) => (
                <div key={campaign.id} className="space-y-1">
                  <HierarchyLink
                    href={campaign.href}
                    isActive={isHierarchyItemActive(pathname, campaign.href)}
                    meta={getCampaignMeta(campaign)}
                    onNavigate={onNavigate}
                    title={campaign.name}
                  />
                  {campaign.tradePlans.map((tradePlan) => (
                    <HierarchyLink
                      key={tradePlan.id}
                      href={tradePlan.href}
                      isActive={isHierarchyItemActive(pathname, tradePlan.href)}
                      meta={getTradePlanMeta(tradePlan)}
                      onNavigate={onNavigate}
                      title={tradePlan.name}
                      tone="nested"
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <SectionHeading title="Standalone Trade Plans" />
          <div className="space-y-1">
            {hierarchy.standaloneTradePlans.length === 0 ? (
              <p className="px-3 text-sm text-olive-10">
                No standalone trade plans yet.
              </p>
            ) : (
              hierarchy.standaloneTradePlans.map((tradePlan) => (
                <HierarchyLink
                  key={tradePlan.id}
                  href={tradePlan.href}
                  isActive={isHierarchyItemActive(pathname, tradePlan.href)}
                  meta={getTradePlanMeta(tradePlan)}
                  onNavigate={onNavigate}
                  title={tradePlan.name}
                />
              ))
            )}
          </div>
        </section>
      </nav>
    </div>
  );
}

export function MobileHierarchyBreadcrumbs({
  breadcrumbs,
}: {
  breadcrumbs: BreadcrumbSegment[];
}) {
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-3 md:hidden">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-olive-10">
        {breadcrumbs.map((segment, index) => {
          const isCurrentPage = index === breadcrumbs.length - 1;

          return (
            <Fragment key={`${segment.label}-${index}`}>
              <li className="flex items-center gap-1.5">
                {index > 0 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-olive-8"
                  />
                ) : null}
                {segment.href && !isCurrentPage ? (
                  <Link
                    href={segment.href}
                    className="transition-colors hover:text-olive-12"
                  >
                    {segment.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isCurrentPage ? "page" : undefined}
                    className={isCurrentPage ? "text-olive-12" : undefined}
                  >
                    {segment.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
