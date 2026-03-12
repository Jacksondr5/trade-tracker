"use client";

import { Preloaded, usePreloadedQuery, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent } from "~/components/ui";
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

function PendingFilterChrome() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <span className="pulseOutline" />
      </span>
      <style jsx>{`
        .pulseOutline {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(82, 169, 255, 0.72);
          box-shadow:
            0 0 0 0 rgba(82, 169, 255, 0.1),
            0 0 0 0 rgba(82, 169, 255, 0.08);
          animation: pulseOutline 1.45s ease-in-out infinite;
        }

        @keyframes pulseOutline {
          0% {
            border-color: rgba(82, 169, 255, 0.6);
            box-shadow:
              0 0 0 0 rgba(82, 169, 255, 0.08),
              0 0 0 0 rgba(82, 169, 255, 0.06);
          }

          50% {
            border-color: rgba(234, 246, 255, 0.95);
            box-shadow:
              0 0 0 2px rgba(82, 169, 255, 0.14),
              0 0 0 5px rgba(82, 169, 255, 0.08);
          }

          100% {
            border-color: rgba(82, 169, 255, 0.6);
            box-shadow:
              0 0 0 0 rgba(82, 169, 255, 0.08),
              0 0 0 0 rgba(82, 169, 255, 0.06);
          }
        }
      `}</style>
    </>
  );
}

export default function CampaignsPageClient({
  preloadedAllCampaigns,
}: {
  preloadedAllCampaigns: Preloaded<typeof api.campaigns.listCampaigns>;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const allCampaigns = usePreloadedQuery(preloadedAllCampaigns);
  const filteredCampaigns = useQuery(
    api.campaigns.listCampaignsByStatus,
    statusFilter !== "all" ? { status: statusFilter } : "skip",
  );

  const requestedCampaigns =
    statusFilter === "all" ? allCampaigns : filteredCampaigns;
  const [resolvedCampaigns, setResolvedCampaigns] = useState(allCampaigns);
  const [resolvedFilter, setResolvedFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (requestedCampaigns === undefined) {
      return;
    }

    setResolvedCampaigns(requestedCampaigns);
    setResolvedFilter(statusFilter);
  }, [requestedCampaigns, statusFilter]);

  const isFilterPending = requestedCampaigns === undefined;
  const campaigns = requestedCampaigns ?? resolvedCampaigns;
  const showEmptyState =
    requestedCampaigns !== undefined && requestedCampaigns.length === 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-olive-12">Campaigns</h1>
          <p className="max-w-2xl text-sm text-olive-11">
            Track live themes, keep linked trade plans grouped, and return to
            watched campaigns from the shared hierarchy.
          </p>
        </div>
        <Button asChild dataTestId="new-campaign-button">
          <Link href="/campaigns/new">New Campaign</Link>
        </Button>
      </div>

      <Card className="mb-4 border-olive-6 bg-olive-2">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.18em] text-olive-10 uppercase">
              Filter
            </p>
            <p className="text-sm text-olive-11">
              Narrow the campaign list by lifecycle status.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter campaigns by status"
            data-testid="status-filter"
          >
            {statusFilterOptions.map((option) => {
              const active = statusFilter === option.value;
              const pending = active && isFilterPending;

              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  dataTestId={`status-filter-${option.value}`}
                  className={
                    pending
                      ? "relative isolate overflow-hidden border border-blue-7 bg-blue-3 text-blue-12 hover:bg-blue-4 hover:text-blue-12"
                      : active
                        ? "border border-blue-7 bg-blue-3 text-blue-12 hover:bg-blue-4 hover:text-blue-12"
                      : "border border-olive-6 bg-transparent text-olive-11 hover:bg-olive-3 hover:text-olive-12"
                  }
                  onClick={() => setStatusFilter(option.value)}
                  aria-pressed={active}
                  disabled={pending}
                >
                  {pending ? (
                    <PendingFilterChrome />
                  ) : null}
                  <span className="relative z-10">{option.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {showEmptyState ? (
        <Card className="border-olive-6 bg-olive-2">
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium text-olive-12">
              {statusFilter === "all"
                ? "No campaigns yet"
                : `No ${statusFilter} campaigns`}
            </p>
            <p className="mt-2 text-sm text-olive-11">
              {statusFilter === "all"
                ? "Create your first campaign to start organizing linked trade plans and watchlist priorities."
                : "Try another lifecycle filter or create a new campaign."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-slate-6 bg-slate-2 transition-opacity"
          aria-busy={isFilterPending}
        >
          <div className="flex items-center justify-between border-b border-slate-6 bg-slate-3/70 px-4 py-2">
            <p className="text-xs font-medium tracking-[0.18em] text-slate-11 uppercase">
              {resolvedFilter === "all"
                ? "All campaigns"
                : `${capitalize(resolvedFilter)} campaigns`}
            </p>
            <div
              className={`flex items-center gap-2 text-xs transition-opacity ${
                isFilterPending ? "opacity-100" : "opacity-0"
              }`}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-11" />
              <span className="text-slate-11">Updating campaigns...</span>
            </div>
          </div>
          <table className="w-full table-auto">
            <thead className="bg-slate-3">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-11">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-slate-6 bg-slate-2 transition-opacity duration-150 ${
                isFilterPending ? "opacity-65" : "opacity-100"
              }`}
            >
              {campaigns.map((campaign) => (
                <tr
                  key={campaign._id}
                  className="cursor-pointer hover:bg-slate-3/80"
                  onClick={() => router.push(`/campaigns/${campaign._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/campaigns/${campaign._id}`);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View campaign ${campaign.name}`}
                  data-testid={`campaign-row-${campaign._id}`}
                >
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap text-slate-12">
                    {campaign.name}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <Badge
                      variant={
                        campaign.status === "active"
                          ? "success"
                          : campaign.status === "planning"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {capitalize(campaign.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-11">
                    {formatDate(campaign._creationTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
