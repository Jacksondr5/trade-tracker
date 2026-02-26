"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "~/components/ui";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency } from "~/lib/format";

type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";

export default function TradePlanDetailPageClient({
  tradePlanId,
  preloadedTradePlan,
  preloadedNotes,
  preloadedAllTrades,
  preloadedAccountMappings,
}: {
  tradePlanId: Id<"tradePlans">;
  preloadedTradePlan: Preloaded<typeof api.tradePlans.getTradePlan>;
  preloadedNotes: Preloaded<typeof api.tradePlanNotes.getNotesByTradePlan>;
  preloadedAllTrades: Preloaded<typeof api.trades.listTrades>;
  preloadedAccountMappings: Preloaded<typeof api.accountMappings.listAccountMappings>;
}) {
  const tradePlan = usePreloadedQuery(preloadedTradePlan);
  const notes = usePreloadedQuery(preloadedNotes);
  const allTrades = usePreloadedQuery(preloadedAllTrades);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);

  const addNote = useMutation(api.tradePlanNotes.addNote);
  const updateNoteM = useMutation(api.tradePlanNotes.updateNote);
  const updateTradePlan = useMutation(api.tradePlans.updateTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);

  const trades = useMemo(
    () => allTrades.filter((t) => t.tradePlanId === tradePlanId),
    [allTrades, tradePlanId],
  );

  const accountNameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of accountMappings) {
      map.set(mapping.accountId, mapping.friendlyName);
    }
    return map;
  }, [accountMappings]);

  const [planName, setPlanName] = useState("");
  const [planNameInitialized, setPlanNameInitialized] = useState(false);
  const [planNameError, setPlanNameError] = useState<string | null>(null);
  const [planNameSaveState, setPlanNameSaveState] = useState<SaveState>("idle");

  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [instrumentSymbolInitialized, setInstrumentSymbolInitialized] = useState(false);
  const [instrumentSymbolError, setInstrumentSymbolError] = useState<string | null>(null);
  const [instrumentSymbolSaveState, setInstrumentSymbolSaveState] = useState<SaveState>("idle");

  const [statusError, setStatusError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  useEffect(() => {
    if (tradePlan && !planNameInitialized) {
      setPlanName(tradePlan.name);
      setPlanNameInitialized(true);
    }
  }, [tradePlan, planNameInitialized]);

  useEffect(() => {
    if (tradePlan && !instrumentSymbolInitialized) {
      setInstrumentSymbol(tradePlan.instrumentSymbol);
      setInstrumentSymbolInitialized(true);
    }
  }, [tradePlan, instrumentSymbolInitialized]);

  const handleSaveName = async () => {
    setPlanNameError(null);
    setPlanNameSaveState("saving");
    const trimmed = planName.trim();
    if (!trimmed) {
      setPlanNameError("Name is required");
      setPlanNameSaveState("idle");
      return;
    }
    try {
      await updateTradePlan({ tradePlanId, name: trimmed });
      setPlanName(trimmed);
      setPlanNameSaveState("saved");
    } catch (error) {
      setPlanNameError(error instanceof Error ? error.message : "Failed to save name");
      setPlanNameSaveState("idle");
    }
  };

  const handleSaveSymbol = async () => {
    setInstrumentSymbolError(null);
    setInstrumentSymbolSaveState("saving");
    const trimmed = instrumentSymbol.trim().toUpperCase();
    if (!trimmed) {
      setInstrumentSymbolError("Symbol is required");
      setInstrumentSymbolSaveState("idle");
      return;
    }
    try {
      await updateTradePlan({ tradePlanId, instrumentSymbol: trimmed });
      setInstrumentSymbol(trimmed);
      setInstrumentSymbolSaveState("saved");
    } catch (error) {
      setInstrumentSymbolError(error instanceof Error ? error.message : "Failed to save symbol");
      setInstrumentSymbolSaveState("idle");
    }
  };

  const handleStatusChange = async (status: TradePlanStatus) => {
    setStatusError(null);
    setIsChangingStatus(true);
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setIsChangingStatus(false);
    }
  };

  if (tradePlan === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-slate-11">Trade plan not found.</p>
        <Link href="/trade-plans" className="mt-4 inline-block text-blue-400 hover:underline">
          Back to trade plans
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link href="/trade-plans" className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12">
        &larr; Back to Trade Plans
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            <div>
              <label htmlFor="plan-name" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
                Plan Name
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-name"
                  maxLength={120}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xl font-bold text-slate-12"
                  value={planName}
                  onChange={(e) => {
                    setPlanName(e.target.value);
                    setPlanNameError(null);
                    if (planNameSaveState === "saved") setPlanNameSaveState("idle");
                  }}
                />
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                  onClick={() => void handleSaveName()}
                  disabled={planNameSaveState === "saving"}
                >
                  Save Name
                </button>
              </div>
              {planNameError && <Alert variant="error" className="mt-2">{planNameError}</Alert>}
              {planNameSaveState === "saving" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-slate-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
              {planNameSaveState === "saved" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>

            <div>
              <label htmlFor="plan-symbol" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
                Instrument Symbol
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-symbol"
                  maxLength={20}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12 sm:w-40"
                  value={instrumentSymbol}
                  onChange={(e) => {
                    setInstrumentSymbol(e.target.value);
                    setInstrumentSymbolError(null);
                    if (instrumentSymbolSaveState === "saved") setInstrumentSymbolSaveState("idle");
                  }}
                />
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                  onClick={() => void handleSaveSymbol()}
                  disabled={instrumentSymbolSaveState === "saving"}
                >
                  Save Symbol
                </button>
              </div>
              {instrumentSymbolError && <Alert variant="error" className="mt-2">{instrumentSymbolError}</Alert>}
              {instrumentSymbolSaveState === "saving" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-slate-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}
              {instrumentSymbolSaveState === "saved" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <div className="w-44">
            <label htmlFor="plan-status" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
              Status
            </label>
            <select
              id="plan-status"
              value={tradePlan.status}
              disabled={isChangingStatus}
              onChange={(e) => void handleStatusChange(e.target.value as TradePlanStatus)}
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-slate-12 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="idea">Idea</option>
              <option value="watching">Watching</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {tradePlan.status === "closed" && tradePlan.closedAt && (
          <p className="text-xs text-slate-11">Closed {new Date(tradePlan.closedAt).toLocaleDateString("en-US")}</p>
        )}

        {tradePlan.campaignId && (
          <p className="mt-2 text-sm text-slate-11">
            Campaign:{" "}
            <Link href={`/campaigns/${tradePlan.campaignId}`} className="text-blue-400 hover:underline">
              View Campaign
            </Link>
          </p>
        )}

        {statusError && <Alert variant="error" className="mt-3">{statusError}</Alert>}
      </div>

      <NotesSection
        notes={notes}
        onAddNote={async (content) => {
          await addNote({ tradePlanId, content });
        }}
        onUpdateNote={async (noteId, content) => {
          await updateNoteM({ noteId: noteId as Id<"tradePlanNotes">, content });
        }}
      />

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trades</h2>
          <Link href="/trades/new" className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600">
            Add Trade
          </Link>
        </div>

        {trades.length === 0 ? (
          <p className="text-sm text-slate-11">No trades linked to this plan yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.brokerageAccountId ? accountNameByAccountId.get(trade.brokerageAccountId) ?? trade.brokerageAccountId : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-slate-11">{formatCurrency(trade.price)}</td>
                    <td className="px-2 py-2">
                      {trade.realizedPL === null ? (
                        <span className="text-slate-11">{"\u2014"}</span>
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
