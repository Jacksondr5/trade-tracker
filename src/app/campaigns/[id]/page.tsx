"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
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
  const addInstrument = useMutation(api.campaigns.addInstrument);
  const removeInstrument = useMutation(api.campaigns.removeInstrument);

  // Instrument form state
  const [instrumentTicker, setInstrumentTicker] = useState("");
  const [instrumentUnderlying, setInstrumentUnderlying] = useState("");
  const [instrumentNotes, setInstrumentNotes] = useState("");
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [isAddingInstrument, setIsAddingInstrument] = useState(false);

  const handleAddInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instrumentTicker.trim()) {
      setInstrumentError("Ticker is required");
      return;
    }

    setInstrumentError(null);
    setIsAddingInstrument(true);

    try {
      await addInstrument({
        campaignId,
        ticker: instrumentTicker.trim().toUpperCase(),
        underlying: instrumentUnderlying.trim() || undefined,
        notes: instrumentNotes.trim() || undefined,
      });
      // Clear form on success
      setInstrumentTicker("");
      setInstrumentUnderlying("");
      setInstrumentNotes("");
    } catch (error) {
      setInstrumentError(
        error instanceof Error ? error.message : "Failed to add instrument"
      );
    } finally {
      setIsAddingInstrument(false);
    }
  };

  const handleRemoveInstrument = async (ticker: string) => {
    try {
      await removeInstrument({ campaignId, ticker });
    } catch (error) {
      setInstrumentError(
        error instanceof Error ? error.message : "Failed to remove instrument"
      );
    }
  };

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
        {/* Instruments section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Instruments</h2>

          {/* Existing instruments list */}
          {campaign.instruments.length > 0 ? (
            <div className="mb-4 space-y-2">
              {campaign.instruments.map((instrument) => (
                <div
                  key={instrument.ticker}
                  className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-4 py-2"
                >
                  <div className="flex-1">
                    <span className="font-medium text-slate-12">
                      {instrument.ticker}
                    </span>
                    {instrument.underlying && (
                      <span className="text-slate-11">
                        {" → "}
                        <span className="text-slate-12">{instrument.underlying}</span>
                      </span>
                    )}
                    {instrument.notes && (
                      <span className="text-slate-11 text-sm ml-2">
                        ({instrument.notes})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveInstrument(instrument.ticker)}
                    className="ml-4 rounded px-2 py-1 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    title="Remove instrument"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-11 text-sm mb-4">No instruments added yet.</p>
          )}

          {/* Add instrument form */}
          <form onSubmit={handleAddInstrument} className="space-y-3">
            {instrumentError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm">
                {instrumentError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="ticker" className="block text-sm text-slate-11 mb-1">
                  Ticker <span className="text-red-400">*</span>
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={instrumentTicker}
                  onChange={(e) => setInstrumentTicker(e.target.value)}
                  placeholder="e.g., GLDM"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="underlying" className="block text-sm text-slate-11 mb-1">
                  Underlying (optional)
                </label>
                <input
                  id="underlying"
                  type="text"
                  value={instrumentUnderlying}
                  onChange={(e) => setInstrumentUnderlying(e.target.value)}
                  placeholder="e.g., GOLD"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm text-slate-11 mb-1">
                  Notes (optional)
                </label>
                <input
                  id="notes"
                  type="text"
                  value={instrumentNotes}
                  onChange={(e) => setInstrumentNotes(e.target.value)}
                  placeholder="e.g., Gold ETF proxy"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isAddingInstrument}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAddingInstrument ? "Adding..." : "Add Instrument"}
            </button>
          </form>
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
