"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";
type StatusFilter = "all" | CampaignStatus;

function formatPL(pl: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(pl));
  return pl >= 0 ? `+${formatted}` : `-${formatted}`;
}

// Component to display P&L for a single campaign (allows hook usage per row)
function CampaignPLCell({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const pl = useQuery(api.campaigns.getCampaignPL, { campaignId });
  
  if (pl === undefined) {
    return <span className="text-slate-11">—</span>;
  }
  
  return (
    <span className={pl.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
      {formatPL(pl.realizedPL)}
    </span>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusBadgeClasses(status: CampaignStatus): string {
  switch (status) {
    case "planning":
      return "bg-blue-900/50 border-blue-700 text-blue-200";
    case "active":
      return "bg-green-900/50 border-green-700 text-green-200";
    case "closed":
      return "bg-slate-700/50 border-slate-600 text-slate-300";
  }
}

export default function CampaignsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Use listCampaignsByStatus when a specific status is selected, otherwise listCampaigns
  const allCampaigns = useQuery(
    api.campaigns.listCampaigns,
    statusFilter === "all" ? {} : "skip"
  );
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
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  P&amp;L
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
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(campaign.status)}`}
                    >
                      {campaign.status.charAt(0).toUpperCase() +
                        campaign.status.slice(1)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-right">
                    <CampaignPLCell campaignId={campaign._id} />
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
