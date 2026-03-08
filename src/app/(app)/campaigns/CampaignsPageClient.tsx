"use client";

import { Preloaded, usePreloadedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import { capitalize, formatDate } from "~/lib/format";

type CampaignStatus = "planning" | "active" | "closed";
type StatusFilter = "all" | CampaignStatus;

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
    statusFilter !== "all" ? { status: statusFilter } : "skip"
  );

  const campaigns = statusFilter === "all" ? allCampaigns : filteredCampaigns;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button dataTestId="new-campaign-button">New Campaign</Button>
        </Link>
      </div>

      {/* Status filter dropdown */}
      <div className="mb-4">
        <label
          htmlFor="status-filter"
          className="text-slate-11 mr-2 text-sm font-medium"
        >
          Filter by status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-slate-12 h-9 rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
          data-testid="status-filter"
        >
          <option value="all">All</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {campaigns === undefined ? (
        <div className="text-slate-11">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {statusFilter === "all"
              ? "No campaigns yet."
              : `No ${statusFilter} campaigns.`}
          </p>
          {statusFilter === "all" && (
            <p className="text-slate-11 mt-2 text-sm">
              Click &quot;New Campaign&quot; to create your first campaign.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Name
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Status
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {campaigns.map((campaign) => (
                <tr
                  key={campaign._id}
                  className="cursor-pointer hover:bg-slate-800/50"
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
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {campaign.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
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
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
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
