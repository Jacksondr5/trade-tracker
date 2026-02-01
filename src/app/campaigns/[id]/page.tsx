"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";
type CampaignOutcome = "profit_target" | "stop_loss" | "manual";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPL(value: number): { text: string; colorClass: string } {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(value));

  if (value > 0) {
    return { text: `+${formatted}`, colorClass: "text-green-400" };
  } else if (value < 0) {
    return { text: `-${formatted}`, colorClass: "text-red-400" };
  }
  return { text: formatted, colorClass: "text-slate-11" };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as Id<"campaigns">;

  const campaign = useQuery(api.campaigns.getCampaign, { campaignId });
  const campaignPL = useQuery(api.campaigns.getCampaignPL, { campaignId });
  const addInstrument = useMutation(api.campaigns.addInstrument);
  const removeInstrument = useMutation(api.campaigns.removeInstrument);
  const addEntryTarget = useMutation(api.campaigns.addEntryTarget);
  const removeEntryTarget = useMutation(api.campaigns.removeEntryTarget);
  const addProfitTarget = useMutation(api.campaigns.addProfitTarget);
  const removeProfitTarget = useMutation(api.campaigns.removeProfitTarget);
  const addStopLoss = useMutation(api.campaigns.addStopLoss);
  const updateCampaignStatus = useMutation(api.campaigns.updateCampaignStatus);
  const campaignNotes = useQuery(api.campaignNotes.getNotesByCampaign, { campaignId });
  const addNote = useMutation(api.campaignNotes.addNote);
  const trades = useQuery(api.trades.getTradesByCampaign, { campaignId });

  // Instrument form state
  const [instrumentTicker, setInstrumentTicker] = useState("");
  const [instrumentUnderlying, setInstrumentUnderlying] = useState("");
  const [instrumentNotes, setInstrumentNotes] = useState("");
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [isAddingInstrument, setIsAddingInstrument] = useState(false);

  // Entry target form state
  const [entryTargetTicker, setEntryTargetTicker] = useState("");
  const [entryTargetPrice, setEntryTargetPrice] = useState("");
  const [entryTargetPercentage, setEntryTargetPercentage] = useState("");
  const [entryTargetNotes, setEntryTargetNotes] = useState("");
  const [entryTargetError, setEntryTargetError] = useState<string | null>(null);
  const [isAddingEntryTarget, setIsAddingEntryTarget] = useState(false);

  // Profit target form state
  const [profitTargetTicker, setProfitTargetTicker] = useState("");
  const [profitTargetPrice, setProfitTargetPrice] = useState("");
  const [profitTargetPercentage, setProfitTargetPercentage] = useState("");
  const [profitTargetNotes, setProfitTargetNotes] = useState("");
  const [profitTargetError, setProfitTargetError] = useState<string | null>(null);
  const [isAddingProfitTarget, setIsAddingProfitTarget] = useState(false);

  // Stop loss form state
  const [stopLossTicker, setStopLossTicker] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [stopLossReason, setStopLossReason] = useState("");
  const [stopLossError, setStopLossError] = useState<string | null>(null);
  const [isAddingStopLoss, setIsAddingStopLoss] = useState(false);

  // Notes form state
  const [noteContent, setNoteContent] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Status change state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<CampaignOutcome | "">("");
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

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

  const handleAddEntryTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTargetTicker) {
      setEntryTargetError("Ticker is required");
      return;
    }
    if (!entryTargetPrice.trim()) {
      setEntryTargetError("Price is required");
      return;
    }

    const price = parseFloat(entryTargetPrice);
    if (isNaN(price) || price <= 0) {
      setEntryTargetError("Price must be a positive number");
      return;
    }

    // Validate percentage if provided
    const parsedPercentage = entryTargetPercentage.trim()
      ? parseFloat(entryTargetPercentage)
      : undefined;
    if (parsedPercentage !== undefined && !Number.isFinite(parsedPercentage)) {
      setEntryTargetError("Percentage must be a valid number");
      return;
    }

    setEntryTargetError(null);
    setIsAddingEntryTarget(true);

    try {
      await addEntryTarget({
        campaignId,
        ticker: entryTargetTicker,
        price,
        percentage: parsedPercentage,
        notes: entryTargetNotes.trim() || undefined,
      });
      // Clear form on success
      setEntryTargetTicker("");
      setEntryTargetPrice("");
      setEntryTargetPercentage("");
      setEntryTargetNotes("");
    } catch (error) {
      setEntryTargetError(
        error instanceof Error ? error.message : "Failed to add entry target"
      );
    } finally {
      setIsAddingEntryTarget(false);
    }
  };

  const handleRemoveEntryTarget = async (index: number) => {
    try {
      await removeEntryTarget({ campaignId, index });
    } catch (error) {
      setEntryTargetError(
        error instanceof Error ? error.message : "Failed to remove entry target"
      );
    }
  };

  const handleAddProfitTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profitTargetTicker) {
      setProfitTargetError("Ticker is required");
      return;
    }
    if (!profitTargetPrice.trim()) {
      setProfitTargetError("Price is required");
      return;
    }

    const price = parseFloat(profitTargetPrice);
    if (isNaN(price) || price <= 0) {
      setProfitTargetError("Price must be a positive number");
      return;
    }

    // Validate percentage if provided
    const parsedPercentage = profitTargetPercentage.trim()
      ? parseFloat(profitTargetPercentage)
      : undefined;
    if (parsedPercentage !== undefined && !Number.isFinite(parsedPercentage)) {
      setProfitTargetError("Percentage must be a valid number");
      return;
    }

    setProfitTargetError(null);
    setIsAddingProfitTarget(true);

    try {
      await addProfitTarget({
        campaignId,
        ticker: profitTargetTicker,
        price,
        percentage: parsedPercentage,
        notes: profitTargetNotes.trim() || undefined,
      });
      // Clear form on success
      setProfitTargetTicker("");
      setProfitTargetPrice("");
      setProfitTargetPercentage("");
      setProfitTargetNotes("");
    } catch (error) {
      setProfitTargetError(
        error instanceof Error ? error.message : "Failed to add profit target"
      );
    } finally {
      setIsAddingProfitTarget(false);
    }
  };

  const handleRemoveProfitTarget = async (index: number) => {
    try {
      await removeProfitTarget({ campaignId, index });
    } catch (error) {
      setProfitTargetError(
        error instanceof Error ? error.message : "Failed to remove profit target"
      );
    }
  };

  const handleAddStopLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopLossTicker) {
      setStopLossError("Ticker is required");
      return;
    }
    if (!stopLossPrice.trim()) {
      setStopLossError("Price is required");
      return;
    }

    const price = parseFloat(stopLossPrice);
    if (isNaN(price) || price <= 0) {
      setStopLossError("Price must be a positive number");
      return;
    }

    setStopLossError(null);
    setIsAddingStopLoss(true);

    try {
      await addStopLoss({
        campaignId,
        ticker: stopLossTicker,
        price,
        reason: stopLossReason.trim() || undefined,
      });
      // Clear form on success
      setStopLossTicker("");
      setStopLossPrice("");
      setStopLossReason("");
    } catch (error) {
      setStopLossError(
        error instanceof Error ? error.message : "Failed to add stop loss"
      );
    } finally {
      setIsAddingStopLoss(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) {
      setNoteError("Note content is required");
      return;
    }

    setNoteError(null);
    setIsAddingNote(true);

    try {
      await addNote({
        campaignId,
        content: noteContent.trim(),
      });
      // Clear form on success
      setNoteContent("");
    } catch (error) {
      setNoteError(
        error instanceof Error ? error.message : "Failed to add note"
      );
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleActivateCampaign = async () => {
    setStatusChangeError(null);
    setIsChangingStatus(true);

    try {
      await updateCampaignStatus({
        campaignId,
        status: "active",
      });
    } catch (error) {
      setStatusChangeError(
        error instanceof Error ? error.message : "Failed to activate campaign"
      );
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleCloseCampaign = async () => {
    if (!selectedOutcome) {
      setStatusChangeError("Please select an outcome");
      return;
    }

    setStatusChangeError(null);
    setIsChangingStatus(true);

    try {
      await updateCampaignStatus({
        campaignId,
        outcome: selectedOutcome,
        status: "closed",
      });
      setShowCloseModal(false);
      setSelectedOutcome("");
    } catch (error) {
      setStatusChangeError(
        error instanceof Error ? error.message : "Failed to close campaign"
      );
    } finally {
      setIsChangingStatus(false);
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

  // Normalize stopLossHistory to handle potential missing field on older campaigns
  const stopLossHistory = campaign.stopLossHistory ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with name and status */}
      <div className="mb-6">
        <Link href="/campaigns" className="text-slate-11 hover:text-slate-12 text-sm mb-2 inline-block">
          ← Back to Campaigns
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-slate-12 text-2xl font-bold">{campaign.name}</h1>
            <span
              className={`rounded border px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(campaign.status)}`}
            >
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
            {campaign.status === "closed" && campaign.closedAt && (
              <span className="text-slate-11 text-sm">
                Closed on{" "}
                {new Date(campaign.closedAt).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            {/* P&L Display */}
            {campaignPL && (
              <div className="flex items-center gap-2">
                <span className="text-slate-11 text-sm">P&L:</span>
                <span className={`text-lg font-semibold ${formatPL(campaignPL.realizedPL).colorClass}`}>
                  {formatPL(campaignPL.realizedPL).text}
                </span>
              </div>
            )}
          </div>

          {/* Status change controls */}
          <div className="flex items-center gap-2">
            {statusChangeError && (
              <span className="text-red-400 text-sm mr-2">{statusChangeError}</span>
            )}
            {campaign.status === "planning" && (
              <button
                onClick={handleActivateCampaign}
                disabled={isChangingStatus}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isChangingStatus ? "Activating..." : "Activate Campaign"}
              </button>
            )}
            {campaign.status === "active" && (
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={isChangingStatus}
                className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
              >
                Close Campaign
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Close campaign modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full mx-4">
            <h2 className="text-slate-12 text-lg font-semibold mb-4">Close Campaign</h2>
            <p className="text-slate-11 text-sm mb-4">
              Select the outcome for this campaign. This action cannot be undone.
            </p>

            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 rounded border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-600">
                <input
                  type="radio"
                  name="outcome"
                  value="profit_target"
                  checked={selectedOutcome === "profit_target"}
                  onChange={() => setSelectedOutcome("profit_target")}
                  className="text-green-600 focus:ring-green-500"
                />
                <div>
                  <span className="text-slate-12 font-medium">Hit Profit Target</span>
                  <p className="text-slate-11 text-xs">Campaign closed at profit target</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-600">
                <input
                  type="radio"
                  name="outcome"
                  value="stop_loss"
                  checked={selectedOutcome === "stop_loss"}
                  onChange={() => setSelectedOutcome("stop_loss")}
                  className="text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="text-slate-12 font-medium">Hit Stop Loss</span>
                  <p className="text-slate-11 text-xs">Campaign closed at stop loss</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-600">
                <input
                  type="radio"
                  name="outcome"
                  value="manual"
                  checked={selectedOutcome === "manual"}
                  onChange={() => setSelectedOutcome("manual")}
                  className="text-slate-400 focus:ring-slate-500"
                />
                <div>
                  <span className="text-slate-12 font-medium">Manual Close</span>
                  <p className="text-slate-11 text-xs">Closed manually for other reasons</p>
                </div>
              </label>
            </div>

            {statusChangeError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm mb-4">
                {statusChangeError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedOutcome("");
                  setStatusChangeError(null);
                }}
                disabled={isChangingStatus}
                className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseCampaign}
                disabled={isChangingStatus || !selectedOutcome}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isChangingStatus ? "Closing..." : "Close Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    aria-label={`Remove ${instrument.ticker}`}
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

        {/* Entry Targets section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Entry Targets</h2>

          {/* Existing entry targets list */}
          {campaign.entryTargets.length > 0 ? (
            <div className="mb-4 space-y-2">
              {campaign.entryTargets.map((target, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-4 py-2"
                >
                  <div className="flex-1">
                    <span className="font-medium text-slate-12">
                      {target.ticker}
                    </span>
                    <span className="text-slate-11 ml-2">
                      @ {formatCurrency(target.price)}
                    </span>
                    {target.percentage !== undefined && (
                      <span className="text-slate-11 ml-2">
                        ({target.percentage}%)
                      </span>
                    )}
                    {target.notes && (
                      <span className="text-slate-11 text-sm ml-2">
                        - {target.notes}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveEntryTarget(index)}
                    className="ml-4 rounded px-2 py-1 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    title="Remove entry target"
                    aria-label={`Remove entry target for ${target.ticker}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-11 text-sm mb-4">No entry targets added yet.</p>
          )}

          {/* Add entry target form */}
          <form onSubmit={handleAddEntryTarget} className="space-y-3">
            {entryTargetError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm">
                {entryTargetError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="entryTargetTicker" className="block text-sm text-slate-11 mb-1">
                  Ticker <span className="text-red-400">*</span>
                </label>
                <select
                  id="entryTargetTicker"
                  value={entryTargetTicker}
                  onChange={(e) => setEntryTargetTicker(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select instrument</option>
                  {campaign.instruments.map((instrument) => (
                    <option key={instrument.ticker} value={instrument.ticker}>
                      {instrument.ticker}
                      {instrument.underlying ? ` (${instrument.underlying})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="entryTargetPrice" className="block text-sm text-slate-11 mb-1">
                  Price <span className="text-red-400">*</span>
                </label>
                <input
                  id="entryTargetPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={entryTargetPrice}
                  onChange={(e) => setEntryTargetPrice(e.target.value)}
                  placeholder="e.g., 150.00"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="entryTargetPercentage" className="block text-sm text-slate-11 mb-1">
                  Percentage (optional)
                </label>
                <input
                  id="entryTargetPercentage"
                  type="number"
                  step="0.1"
                  value={entryTargetPercentage}
                  onChange={(e) => setEntryTargetPercentage(e.target.value)}
                  placeholder="e.g., 25"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="entryTargetNotes" className="block text-sm text-slate-11 mb-1">
                  Notes (optional)
                </label>
                <input
                  id="entryTargetNotes"
                  type="text"
                  value={entryTargetNotes}
                  onChange={(e) => setEntryTargetNotes(e.target.value)}
                  placeholder="e.g., Initial entry"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isAddingEntryTarget || campaign.instruments.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAddingEntryTarget ? "Adding..." : "Add Entry Target"}
            </button>
            {campaign.instruments.length === 0 && (
              <p className="text-slate-11 text-sm">Add instruments first to create entry targets.</p>
            )}
          </form>
        </div>

        {/* Profit Targets section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Profit Targets</h2>

          {/* Existing profit targets list */}
          {campaign.profitTargets.length > 0 ? (
            <div className="mb-4 space-y-2">
              {campaign.profitTargets.map((target, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-4 py-2"
                >
                  <div className="flex-1">
                    <span className="font-medium text-slate-12">
                      {target.ticker}
                    </span>
                    <span className="text-slate-11 ml-2">
                      @ {formatCurrency(target.price)}
                    </span>
                    {target.percentage !== undefined && (
                      <span className="text-slate-11 ml-2">
                        ({target.percentage}%)
                      </span>
                    )}
                    {target.notes && (
                      <span className="text-slate-11 text-sm ml-2">
                        - {target.notes}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveProfitTarget(index)}
                    className="ml-4 rounded px-2 py-1 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    title="Remove profit target"
                    aria-label={`Remove profit target for ${target.ticker}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-11 text-sm mb-4">No profit targets added yet.</p>
          )}

          {/* Add profit target form */}
          <form onSubmit={handleAddProfitTarget} className="space-y-3">
            {profitTargetError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm">
                {profitTargetError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="profitTargetTicker" className="block text-sm text-slate-11 mb-1">
                  Ticker <span className="text-red-400">*</span>
                </label>
                <select
                  id="profitTargetTicker"
                  value={profitTargetTicker}
                  onChange={(e) => setProfitTargetTicker(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select instrument</option>
                  {campaign.instruments.map((instrument) => (
                    <option key={instrument.ticker} value={instrument.ticker}>
                      {instrument.ticker}
                      {instrument.underlying ? ` (${instrument.underlying})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="profitTargetPrice" className="block text-sm text-slate-11 mb-1">
                  Price <span className="text-red-400">*</span>
                </label>
                <input
                  id="profitTargetPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={profitTargetPrice}
                  onChange={(e) => setProfitTargetPrice(e.target.value)}
                  placeholder="e.g., 200.00"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="profitTargetPercentage" className="block text-sm text-slate-11 mb-1">
                  Percentage (optional)
                </label>
                <input
                  id="profitTargetPercentage"
                  type="number"
                  step="0.1"
                  value={profitTargetPercentage}
                  onChange={(e) => setProfitTargetPercentage(e.target.value)}
                  placeholder="e.g., 50"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="profitTargetNotes" className="block text-sm text-slate-11 mb-1">
                  Notes (optional)
                </label>
                <input
                  id="profitTargetNotes"
                  type="text"
                  value={profitTargetNotes}
                  onChange={(e) => setProfitTargetNotes(e.target.value)}
                  placeholder="e.g., First take profit"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isAddingProfitTarget || campaign.instruments.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAddingProfitTarget ? "Adding..." : "Add Profit Target"}
            </button>
            {campaign.instruments.length === 0 && (
              <p className="text-slate-11 text-sm">Add instruments first to create profit targets.</p>
            )}
          </form>
        </div>

        {/* Stop Loss section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Stop Loss</h2>

          {/* Current stop loss (most recent) - highlighted */}
          {stopLossHistory.length > 0 && (
            <div className="mb-4">
              <h3 className="text-slate-11 text-sm font-medium mb-2">Current Stop Loss</h3>
              {(() => {
                // Get the most recent stop loss (last in array since they're appended)
                const currentStopLoss = stopLossHistory[stopLossHistory.length - 1];
                return (
                  <div className="rounded border-2 border-yellow-600 bg-yellow-900/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-yellow-200 text-lg">
                        {currentStopLoss.ticker}
                      </span>
                      <span className="text-yellow-100 text-lg">
                        @ {formatCurrency(currentStopLoss.price)}
                      </span>
                    </div>
                    {currentStopLoss.reason && (
                      <p className="text-yellow-200/80 text-sm mt-1">
                        {currentStopLoss.reason}
                      </p>
                    )}
                    <p className="text-yellow-200/60 text-xs mt-1">
                      Set on {new Date(currentStopLoss.setAt).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Stop loss history (all entries, newest first) */}
          {stopLossHistory.length > 1 && (
            <div className="mb-4">
              <h3 className="text-slate-11 text-sm font-medium mb-2">History</h3>
              <div className="space-y-2">
                {/* Show all except the most recent (current), sorted newest first */}
                {[...stopLossHistory]
                  .slice(0, -1)
                  .reverse()
                  .map((stopLoss, index) => (
                    <div
                      key={index}
                      className="rounded border border-slate-700 bg-slate-900 px-4 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-12">
                          {stopLoss.ticker}
                        </span>
                        <span className="text-slate-11">
                          @ {formatCurrency(stopLoss.price)}
                        </span>
                        <span className="text-slate-11/60 text-xs ml-auto">
                          {new Date(stopLoss.setAt).toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {stopLoss.reason && (
                        <p className="text-slate-11 text-sm mt-1">
                          {stopLoss.reason}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {stopLossHistory.length === 0 && (
            <p className="text-slate-11 text-sm mb-4">No stop loss set yet.</p>
          )}

          {/* Add stop loss form */}
          <form onSubmit={handleAddStopLoss} className="space-y-3">
            {stopLossError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm">
                {stopLossError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="stopLossTicker" className="block text-sm text-slate-11 mb-1">
                  Ticker <span className="text-red-400">*</span>
                </label>
                <select
                  id="stopLossTicker"
                  value={stopLossTicker}
                  onChange={(e) => setStopLossTicker(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select instrument</option>
                  {campaign.instruments.map((instrument) => (
                    <option key={instrument.ticker} value={instrument.ticker}>
                      {instrument.ticker}
                      {instrument.underlying ? ` (${instrument.underlying})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="stopLossPrice" className="block text-sm text-slate-11 mb-1">
                  Price <span className="text-red-400">*</span>
                </label>
                <input
                  id="stopLossPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={stopLossPrice}
                  onChange={(e) => setStopLossPrice(e.target.value)}
                  placeholder="e.g., 145.00"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="stopLossReason" className="block text-sm text-slate-11 mb-1">
                  Reason (optional)
                </label>
                <input
                  id="stopLossReason"
                  type="text"
                  value={stopLossReason}
                  onChange={(e) => setStopLossReason(e.target.value)}
                  placeholder="e.g., Below support level"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isAddingStopLoss || campaign.instruments.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAddingStopLoss ? "Setting..." : "Set Stop Loss"}
            </button>
            {campaign.instruments.length === 0 && (
              <p className="text-slate-11 text-sm">Add instruments first to set a stop loss.</p>
            )}
          </form>
        </div>

        {/* Notes section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-slate-12 text-lg font-semibold mb-3">Notes</h2>

          {/* Existing notes list */}
          {campaignNotes === undefined ? (
            <p className="text-slate-11 text-sm mb-4">Loading notes...</p>
          ) : campaignNotes.length > 0 ? (
            <div className="mb-4 space-y-3">
              {campaignNotes.map((note) => (
                <div
                  key={note._id}
                  className="rounded border border-slate-700 bg-slate-900 px-4 py-3"
                >
                  <p className="text-slate-12 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-slate-11/60 text-xs mt-2">
                    {new Date(note._creationTime).toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-11 text-sm mb-4">No notes added yet.</p>
          )}

          {/* Add note form */}
          <form onSubmit={handleAddNote} className="space-y-3">
            {noteError && (
              <div className="rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200 text-sm">
                {noteError}
              </div>
            )}
            <div>
              <label htmlFor="noteContent" className="block text-sm text-slate-11 mb-1">
                Add a note
              </label>
              <textarea
                id="noteContent"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your thoughts, observations, or updates..."
                rows={3}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={isAddingNote || !noteContent.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAddingNote ? "Adding..." : "Add Note"}
            </button>
          </form>
        </div>

        {/* Trades section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-12 text-lg font-semibold">Trades</h2>
            {campaign.status !== "closed" && (
              <Link
                href={`/trades/new?campaignId=${campaignId}`}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add Trade
              </Link>
            )}
          </div>

          {campaign.status === "closed" && (
            <p className="text-slate-11/60 text-sm mb-4">
              This campaign is closed. No new trades can be added.
            </p>
          )}

          {trades === undefined ? (
            <p className="text-slate-11 text-sm">Loading trades...</p>
          ) : trades.length === 0 ? (
            <p className="text-slate-11 text-sm">No trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/50 text-left text-sm text-slate-11">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ticker</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {trades.map((trade) => (
                    <tr
                      key={trade._id}
                      className="text-sm text-slate-12 hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(trade.date).toLocaleDateString("en-US", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium">{trade.ticker}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            trade.side === "buy"
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {trade.side.charAt(0).toUpperCase() + trade.side.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {trade.direction.charAt(0).toUpperCase() + trade.direction.slice(1)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(trade.price)}
                      </td>
                      <td className="px-4 py-3 text-right">{trade.quantity}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(trade.price * trade.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
