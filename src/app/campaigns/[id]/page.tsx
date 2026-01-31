"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";

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

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as Id<"campaigns">;

  const campaign = useQuery(api.campaigns.getCampaign, { campaignId });

  if (campaign === undefined) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-slate-11">Loading campaign...</div>
      </div>
    );
  }

  if (campaign === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">Campaign not found.</p>
          <Link href="/campaigns" className="text-blue-400 hover:underline mt-4 inline-block">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with name and status */}
      <div className="mb-6">
        <Link href="/campaigns" className="text-slate-11 hover:text-slate-12 text-sm mb-2 inline-block">
          ← Back to Campaigns
        </Link>
        <div className="flex items-center gap-4">
          <h1 className="text-slate-12 text-2xl font-bold">{campaign.name}</h1>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(campaign.status)}`}
          >
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Thesis section */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-slate-12 text-lg font-semibold mb-3">Thesis</h2>
        <p className="text-slate-11 whitespace-pre-wrap">{campaign.thesis}</p>
      </div>

      {/* Placeholder sections */}
      <div className="grid gap-6">
        {/* Instruments placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Instruments</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - instruments will be displayed here.</p>
        </div>

        {/* Entry Targets placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Entry Targets</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - entry targets will be displayed here.</p>
        </div>

        {/* Profit Targets placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Profit Targets</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - profit targets will be displayed here.</p>
        </div>

        {/* Stop Loss placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Stop Loss</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - stop loss history will be displayed here.</p>
        </div>

        {/* Notes placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Notes</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - campaign notes will be displayed here.</p>
        </div>

        {/* Trades placeholder */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Trades</h2>
          <p className="text-slate-11 text-sm italic">Coming soon - linked trades will be displayed here.</p>
        </div>
      </div>
    </div>
  );
}
