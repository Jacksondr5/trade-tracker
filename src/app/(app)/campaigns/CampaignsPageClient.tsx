"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { FileText, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import { capitalize, formatDate } from "~/lib/format";

type CampaignStatus = "planning" | "active" | "closed";
type StatusFilter = "all" | CampaignStatus;

const statusFilterOptions: Array<{
  label: string;
  value: StatusFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Planning", value: "planning" },
  { label: "Active", value: "active" },
  { label: "Closed", value: "closed" },
];

type CampaignSummaries = typeof api.campaigns.listCampaignWorkspaceSummaries extends {
  _returnType: infer R;
}
  ? R
  : never;
type CampaignSummary = CampaignSummaries[number];

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  const hasPlans = campaign.linkedTradePlans.totalCount > 0;

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group block rounded-lg border border-olive-6 bg-olive-2 p-4 transition-colors hover:border-olive-7 hover:bg-olive-3"
      data-testid={`campaign-card-${campaign.id}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="truncate text-sm font-semibold text-olive-12">
            {campaign.name}
          </h3>
          {campaign.isWatched && (
            <Star
              className="size-3.5 shrink-0 fill-amber-9 text-amber-9"
              aria-label="Watched"
            />
          )}
        </div>
        <Badge
          variant={
            campaign.status === "active"
              ? "success"
              : campaign.status === "planning"
                ? "info"
                : "neutral"
          }
          className="shrink-0"
        >
          {capitalize(campaign.status)}
        </Badge>
      </div>

      {campaign.thesis && (
        <p className="mb-3 line-clamp-2 text-sm text-olive-11">
          {campaign.thesis}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-11">
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3" />
          {hasPlans ? (
            <>
              {campaign.linkedTradePlans.totalCount}{" "}
              {campaign.linkedTradePlans.totalCount === 1 ? "plan" : "plans"}
              {campaign.linkedTradePlans.openCount > 0 && (
                <span className="text-olive-10">
                  ({campaign.linkedTradePlans.openCount} open)
                </span>
              )}
            </>
          ) : (
            "No plans"
          )}
        </span>

        <span className="inline-flex items-center gap-1">
          <TrendingUp className="size-3" />
          {campaign.linkedTrades.totalCount}{" "}
          {campaign.linkedTrades.totalCount === 1 ? "trade" : "trades"}
        </span>

        <span className="ml-auto text-slate-11/70">
          {formatDate(campaign.createdAt)}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({
  statusFilter,
  onClearFilter,
}: {
  statusFilter: StatusFilter;
  onClearFilter: () => void;
}) {
  const isFiltered = statusFilter !== "all";

  return (
    <div className="rounded-lg border border-olive-6 bg-olive-2 p-6 sm:p-8">
      <div className="max-w-xl space-y-3">
        <p className="text-sm font-medium text-olive-12">
          {isFiltered ? `No ${statusFilter} campaigns` : "No campaigns yet"}
        </p>
        <p className="text-sm text-olive-11">
          {isFiltered
            ? "Try another lifecycle filter or clear the filter to view all campaigns."
            : "Campaigns organize linked trade plans around a strategic thesis. Create one to start grouping your ideas."}
        </p>
        {isFiltered ? (
          <Button
            type="button"
            variant="secondary"
            dataTestId="empty-state-show-all-campaigns-button"
            onClick={onClearFilter}
          >
            Show all campaigns
          </Button>
        ) : (
          <Button asChild dataTestId="empty-state-new-campaign-button">
            <Link href="/campaigns/new">New campaign</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CampaignsPageClient({
  preloadedCampaignWorkspaceSummaries,
}: {
  preloadedCampaignWorkspaceSummaries: Preloaded<
    typeof api.campaigns.listCampaignWorkspaceSummaries
  >;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const allCampaigns = usePreloadedQuery(preloadedCampaignWorkspaceSummaries);
  const campaigns = useMemo(
    () =>
      statusFilter === "all"
        ? allCampaigns
        : allCampaigns.filter((c) => c.status === statusFilter),
    [allCampaigns, statusFilter],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-olive-12">Campaigns</h1>
        <Button asChild dataTestId="new-campaign-button">
          <Link href="/campaigns/new">New Campaign</Link>
        </Button>
      </div>

      <div
        className="mb-5 flex flex-wrap gap-2"
        role="group"
        aria-label="Filter campaigns by status"
        data-testid="status-filter"
      >
        {statusFilterOptions.map((option) => {
          const active = statusFilter === option.value;

          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={active ? "secondary" : "ghost"}
              dataTestId={`status-filter-${option.value}`}
              className={
                active
                  ? "border border-blue-7 bg-blue-3 text-blue-12 hover:bg-blue-4 hover:text-blue-12"
                  : "border border-olive-6 bg-transparent text-olive-11 hover:bg-olive-3 hover:text-olive-12"
              }
              onClick={() => setStatusFilter(option.value)}
              aria-pressed={active}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          statusFilter={statusFilter}
          onClearFilter={() => setStatusFilter("all")}
        />
      ) : (
        <div className="grid gap-3" data-testid="campaigns-collection">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
