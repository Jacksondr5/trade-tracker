"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";
type CampaignOutcome = "profit_target" | "stop_loss" | "manual";
type TradePlanStatus = "idea" | "watching" | "active" | "closed";

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

function nextStatus(status: TradePlanStatus): TradePlanStatus {
  switch (status) {
    case "idea":
      return "watching";
    case "watching":
      return "active";
    case "active":
      return "closed";
    case "closed":
      return "watching";
  }
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as Id<"campaigns">;

  const campaign = useQuery(api.campaigns.getCampaign, { campaignId });
  const campaignNotes = useQuery(api.campaignNotes.getNotesByCampaign, { campaignId });
  const tradePlans = useQuery(api.tradePlans.listTradePlansByCampaign, { campaignId });
  const allTrades = useQuery(api.trades.listTrades);
  const campaignPL = useQuery(api.campaigns.getCampaignPL, { campaignId });
  const positionStatus = useQuery(api.campaigns.getCampaignPositionStatus, { campaignId });

  const addNote = useMutation(api.campaignNotes.addNote);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);
  const updateCampaignStatus = useMutation(api.campaigns.updateCampaignStatus);

  const trades = useMemo(() => {
    if (!tradePlans || !allTrades) {
      return undefined;
    }

    const tradePlanIds = new Set(tradePlans.map((plan) => plan._id));
    return allTrades.filter((trade) => trade.tradePlanId && tradePlanIds.has(trade.tradePlanId));
  }, [allTrades, tradePlans]);

  const tradePlanNameById = useMemo(() => {
    const map = new Map<Id<"tradePlans">, string>();
    if (!tradePlans) {
      return map;
    }

    for (const tradePlan of tradePlans) {
      map.set(tradePlan._id, tradePlan.name);
    }
    return map;
  }, [tradePlans]);

  const [noteContent, setNoteContent] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);

  const [retrospective, setRetrospective] = useState("");
  const [retrospectiveError, setRetrospectiveError] = useState<string | null>(null);
  const [retrospectiveInitialized, setRetrospectiveInitialized] = useState(false);
  const [isSavingRetrospective, setIsSavingRetrospective] = useState(false);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<CampaignOutcome | "">("");
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [closureBannerDismissed, setClosureBannerDismissed] = useState(false);

  const [planName, setPlanName] = useState("");
  const [planInstrumentSymbol, setPlanInstrumentSymbol] = useState("");
  const [planEntryConditions, setPlanEntryConditions] = useState("");
  const [planExitConditions, setPlanExitConditions] = useState("");
  const [planTargetConditions, setPlanTargetConditions] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  useEffect(() => {
    if (campaign && !retrospectiveInitialized) {
      setRetrospective(campaign.retrospective || "");
      setRetrospectiveInitialized(true);
    }
  }, [campaign, retrospectiveInitialized]);

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
      setNoteContent("");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Failed to add note");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleSaveRetrospective = async () => {
    setRetrospectiveError(null);
    setIsSavingRetrospective(true);

    try {
      await updateCampaign({
        campaignId,
        retrospective: retrospective.trim() || undefined,
      });
    } catch (error) {
      setRetrospectiveError(
        error instanceof Error ? error.message : "Failed to save retrospective",
      );
    } finally {
      setIsSavingRetrospective(false);
    }
  };

  const handleCreateTradePlan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!planName.trim() || !planInstrumentSymbol.trim()) {
      setPlanError("Name and instrument symbol are required");
      return;
    }

    setPlanError(null);
    setIsCreatingPlan(true);

    try {
      await createTradePlan({
        campaignId,
        entryConditions: planEntryConditions.trim() || "Awaiting technical confirmation",
        exitConditions: planExitConditions.trim() || "Invalidation or thesis breakdown",
        instrumentSymbol: planInstrumentSymbol.trim().toUpperCase(),
        name: planName.trim(),
        targetConditions: planTargetConditions.trim() || "Take profit on thesis completion",
      });

      setPlanName("");
      setPlanInstrumentSymbol("");
      setPlanEntryConditions("");
      setPlanExitConditions("");
      setPlanTargetConditions("");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Failed to create trade plan");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleAdvanceTradePlanStatus = async (
    tradePlanId: Id<"tradePlans">,
    currentStatus: TradePlanStatus,
  ) => {
    try {
      await updateTradePlanStatus({
        status: nextStatus(currentStatus),
        tradePlanId,
      });
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Failed to update trade plan status");
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
        error instanceof Error ? error.message : "Failed to activate campaign",
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
      setStatusChangeError(error instanceof Error ? error.message : "Failed to close campaign");
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
        <p className="text-slate-11">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 inline-block text-blue-400 hover:underline">
          Back to campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link href="/campaigns" className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12">
        ← Back to Campaigns
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-12">{campaign.name}</h1>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(campaign.status)}`}
          >
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </span>
          {campaign.status === "closed" && campaign.closedAt && (
            <span className="text-xs text-slate-11">
              Closed {new Date(campaign.closedAt).toLocaleDateString("en-US")}
            </span>
          )}
        </div>

        {campaignPL !== undefined && campaignPL.tradeCount > 0 && (
          <p className="text-sm text-slate-11">
            Realized P&L: <span className={campaignPL.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
              {campaignPL.realizedPL >= 0 ? "+" : ""}
              {formatCurrency(campaignPL.realizedPL)}
            </span>
          </p>
        )}

        {statusChangeError && <p className="mt-3 text-sm text-red-300">{statusChangeError}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {campaign.status === "planning" && (
            <button
              className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600"
              onClick={() => void handleActivateCampaign()}
              disabled={isChangingStatus}
            >
              {isChangingStatus ? "Activating..." : "Activate Campaign"}
            </button>
          )}

          {campaign.status === "active" && (
            <button
              className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
              onClick={() => setShowCloseModal(true)}
            >
              Close Campaign
            </button>
          )}
        </div>
      </div>

      {campaign.status === "active" &&
        positionStatus &&
        positionStatus.isFullyClosed &&
        !closureBannerDismissed && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-green-700 bg-green-900/20 p-4">
            <p className="text-sm text-green-200">
              All positions in this campaign have been closed. Ready to close the campaign?
            </p>
            <button
              className="rounded bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-600"
              onClick={() => setShowCloseModal(true)}
            >
              Close Campaign
            </button>
            <button
              className="text-green-200 hover:text-green-100"
              onClick={() => setClosureBannerDismissed(true)}
            >
              ✕
            </button>
          </div>
        )}

      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-5">
            <h2 className="mb-2 text-lg font-semibold text-slate-12">Close Campaign</h2>
            <p className="mb-4 text-sm text-slate-11">Select an outcome for this campaign.</p>

            <div className="space-y-2 text-sm text-slate-12">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={selectedOutcome === "profit_target"}
                  onChange={() => setSelectedOutcome("profit_target")}
                />
                Profit target
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={selectedOutcome === "stop_loss"}
                  onChange={() => setSelectedOutcome("stop_loss")}
                />
                Stop loss
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={selectedOutcome === "manual"}
                  onChange={() => setSelectedOutcome("manual")}
                />
                Manual
              </label>
            </div>

            {statusChangeError && <p className="mt-3 text-sm text-red-300">{statusChangeError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-700"
                onClick={() => {
                  setShowCloseModal(false);
                  setStatusChangeError(null);
                  setSelectedOutcome("");
                }}
              >
                Cancel
              </button>
              <button
                className="rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-white"
                onClick={() => void handleCloseCampaign()}
                disabled={isChangingStatus}
              >
                {isChangingStatus ? "Closing..." : "Close Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-2 text-lg font-semibold text-slate-12">Thesis</h2>
        <p className="whitespace-pre-wrap text-slate-11">{campaign.thesis}</p>
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trade Plans</h2>
          <span className="text-sm text-slate-11">{tradePlans?.length ?? 0} plans</span>
        </div>

        {planError && <p className="mb-3 text-sm text-red-300">{planError}</p>}

        <form className="mb-4 grid gap-2" onSubmit={handleCreateTradePlan}>
          <input
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Trade plan name"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
          />
          <input
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Instrument symbol"
            value={planInstrumentSymbol}
            onChange={(e) => setPlanInstrumentSymbol(e.target.value)}
          />
          <textarea
            className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Entry conditions"
            value={planEntryConditions}
            onChange={(e) => setPlanEntryConditions(e.target.value)}
          />
          <textarea
            className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Exit conditions"
            value={planExitConditions}
            onChange={(e) => setPlanExitConditions(e.target.value)}
          />
          <textarea
            className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Target conditions"
            value={planTargetConditions}
            onChange={(e) => setPlanTargetConditions(e.target.value)}
          />
          <div>
            <button
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
              type="submit"
              disabled={isCreatingPlan}
            >
              {isCreatingPlan ? "Creating..." : "Add Trade Plan"}
            </button>
          </div>
        </form>

        {tradePlans === undefined ? (
          <p className="text-sm text-slate-11">Loading trade plans...</p>
        ) : tradePlans.length === 0 ? (
          <p className="text-sm text-slate-11">No trade plans yet.</p>
        ) : (
          <div className="space-y-3">
            {tradePlans.map((plan) => (
              <div key={plan._id} className="rounded border border-slate-600 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-12">{plan.name}</p>
                    <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                  </div>
                  <button
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-12 hover:bg-slate-700"
                    onClick={() => void handleAdvanceTradePlanStatus(plan._id, plan.status)}
                  >
                    {plan.status} → {nextStatus(plan.status)}
                  </button>
                </div>
                <p className="text-sm text-slate-11">
                  <strong>Entry:</strong> {plan.entryConditions}
                </p>
                <p className="text-sm text-slate-11">
                  <strong>Exit:</strong> {plan.exitConditions}
                </p>
                <p className="text-sm text-slate-11">
                  <strong>Targets:</strong> {plan.targetConditions}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">Notes</h2>

        {campaignNotes === undefined ? (
          <p className="text-sm text-slate-11">Loading notes...</p>
        ) : campaignNotes.length === 0 ? (
          <p className="mb-3 text-sm text-slate-11">No notes yet.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {campaignNotes.map((note) => (
              <div key={note._id} className="rounded border border-slate-600 p-3">
                <p className="whitespace-pre-wrap text-sm text-slate-11">{note.content}</p>
              </div>
            ))}
          </div>
        )}

        {noteError && <p className="mb-2 text-sm text-red-300">{noteError}</p>}

        <form onSubmit={handleAddNote} className="space-y-2">
          <textarea
            className="min-h-24 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Add a note"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <button
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
            type="submit"
            disabled={isAddingNote}
          >
            {isAddingNote ? "Saving..." : "Add Note"}
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">Retrospective</h2>

        {campaign.status !== "closed" ? (
          <p className="text-sm text-slate-11">Retrospective is available after the campaign is closed.</p>
        ) : (
          <>
            {retrospectiveError && <p className="mb-2 text-sm text-red-300">{retrospectiveError}</p>}
            <textarea
              className="min-h-32 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
              value={retrospective}
              onChange={(e) => setRetrospective(e.target.value)}
              placeholder="What worked, what failed, and what changed your view?"
            />
            <button
              className="mt-2 rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
              onClick={() => void handleSaveRetrospective()}
              disabled={isSavingRetrospective}
            >
              {isSavingRetrospective ? "Saving..." : "Save Retrospective"}
            </button>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trades</h2>
          <Link href="/trades/new" className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600">
            Add Trade
          </Link>
        </div>

        {trades === undefined ? (
          <p className="text-sm text-slate-11">Loading trades...</p>
        ) : trades.length === 0 ? (
          <p className="text-sm text-slate-11">No trades linked to this campaign yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Trade Plan</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.tradePlanId ? tradePlanNameById.get(trade.tradePlanId) ?? "—" : "—"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-slate-11">{formatCurrency(trade.price)}</td>
                    <td className="px-2 py-2">
                      {trade.realizedPL === null ? (
                        <span className="text-slate-11">—</span>
                      ) : (
                        <span className={trade.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
                          {trade.realizedPL >= 0 ? "+" : ""}
                          {formatCurrency(trade.realizedPL)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
