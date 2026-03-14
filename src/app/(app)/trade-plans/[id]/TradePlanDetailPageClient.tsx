"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MobileHierarchyBreadcrumbs } from "~/components/app-shell/campaign-trade-plan-hierarchy";
import { useNavigationData } from "~/components/app-shell";
import { Alert, Badge } from "~/components/ui";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  buildHierarchyBreadcrumbs,
  findTradePlanNavigationItem,
  LINKED_TRADE_PLAN_LABEL,
  STANDALONE_TRADE_PLAN_LABEL,
} from "~/lib/campaign-trade-plan-navigation";
import { formatCurrency } from "~/lib/format";

type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";

export default function TradePlanDetailPageClient({
  tradePlanId,
  preloadedTradePlan,
  preloadedNotes,
  preloadedTrades,
  preloadedAccountMappings,
  preloadedInboxTradesForPlan,
  preloadedPortfolios,
}: {
  tradePlanId: Id<"tradePlans">;
  preloadedTradePlan: Preloaded<typeof api.tradePlans.getTradePlan>;
  preloadedNotes: Preloaded<typeof api.notes.getNotesByTradePlan>;
  preloadedTrades: Preloaded<typeof api.trades.listTradesByTradePlan>;
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedInboxTradesForPlan: Preloaded<
    typeof api.imports.listInboxTradesForTradePlan
  >;
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
}) {
  const tradePlan = usePreloadedQuery(preloadedTradePlan);
  const notes = usePreloadedQuery(preloadedNotes);
  const trades = usePreloadedQuery(preloadedTrades);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const inboxTradesForPlan = usePreloadedQuery(preloadedInboxTradesForPlan);
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const { hierarchy } = useNavigationData();

  const addNote = useMutation(api.notes.addNote);
  const updateNoteM = useMutation(api.notes.updateNote);
  const updateTradePlan = useMutation(api.tradePlans.updateTradePlan);
  const updateTradePlanStatus = useMutation(
    api.tradePlans.updateTradePlanStatus,
  );
  const acceptTrade = useMutation(api.imports.acceptTrade);

  const [pendingPortfolioIds, setPendingPortfolioIds] = useState<
    Record<string, string>
  >({});

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
  const [instrumentSymbolInitialized, setInstrumentSymbolInitialized] =
    useState(false);
  const [instrumentSymbolError, setInstrumentSymbolError] = useState<
    string | null
  >(null);
  const [instrumentSymbolSaveState, setInstrumentSymbolSaveState] =
    useState<SaveState>("idle");

  const [statusError, setStatusError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [inboxAcceptError, setInboxAcceptError] = useState<string | null>(null);
  const [acceptingInboxTradeIds, setAcceptingInboxTradeIds] = useState<
    Set<string>
  >(new Set());
  const breadcrumbs = buildHierarchyBreadcrumbs(hierarchy, {
    kind: "tradePlan",
    tradePlanId,
  });
  const navigationTradePlan = useMemo(
    () => findTradePlanNavigationItem(hierarchy, tradePlanId),
    [hierarchy, tradePlanId],
  );
  const linkedCampaign = navigationTradePlan?.parentCampaign ?? null;
  const relationshipLabel =
    linkedCampaign !== null || tradePlan?.campaignId
      ? LINKED_TRADE_PLAN_LABEL
      : STANDALONE_TRADE_PLAN_LABEL;

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
      setPlanNameError(
        error instanceof Error ? error.message : "Failed to save name",
      );
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
      setInstrumentSymbolError(
        error instanceof Error ? error.message : "Failed to save symbol",
      );
      setInstrumentSymbolSaveState("idle");
    }
  };

  const handleStatusChange = async (status: TradePlanStatus) => {
    setStatusError(null);
    setIsChangingStatus(true);
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to update status",
      );
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleAcceptInboxTrade = async (
    inboxTradeId: Id<"inboxTrades">,
    portfolioId: string,
  ) => {
    setInboxAcceptError(null);
    setAcceptingInboxTradeIds((prev) => {
      const next = new Set(prev);
      next.add(inboxTradeId);
      return next;
    });
    try {
      const result = await acceptTrade({
        inboxTradeId,
        tradePlanId,
        portfolioId: portfolioId
          ? (portfolioId as Id<"portfolios">)
          : undefined,
      });
      if (result.error) {
        setInboxAcceptError(result.error);
      } else if (!result.accepted) {
        setInboxAcceptError("Failed to accept trade");
      }
    } catch (error) {
      setInboxAcceptError(
        error instanceof Error ? error.message : "Failed to accept trade",
      );
    } finally {
      setAcceptingInboxTradeIds((prev) => {
        const next = new Set(prev);
        next.delete(inboxTradeId);
        return next;
      });
    }
  };

  if (tradePlan === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-slate-11">Trade plan not found.</p>
        <Link
          href="/trade-plans"
          className="mt-4 inline-block text-blue-400 hover:underline"
        >
          Back to trade plans
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {breadcrumbs !== null ? (
        <MobileHierarchyBreadcrumbs breadcrumbs={breadcrumbs} />
      ) : (
        <Link
          href="/trade-plans"
          data-testid="trade-plan-back-link"
          className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12 md:hidden"
        >
          &larr; Back to Trade Plans
        </Link>
      )}

      <Link
        href="/trade-plans"
        data-testid="trade-plan-back-link"
        className="mb-2 hidden text-sm text-slate-11 hover:text-slate-12 md:inline-block"
      >
        &larr; Back to Trade Plans
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-4 space-y-1">
          <p className="text-xs font-medium tracking-[0.18em] text-slate-11 uppercase">
            {relationshipLabel}
          </p>
          {tradePlan.campaignId ? (
            <p className="text-sm text-slate-11">
              Campaign:{" "}
              <Link
                href={
                  linkedCampaign?.href ?? `/campaigns/${tradePlan.campaignId}`
                }
                className="text-blue-400 hover:underline"
              >
                {linkedCampaign?.name ?? "View Campaign"}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            <div>
              <label
                htmlFor="plan-name"
                className="mb-1 block text-xs tracking-wide text-slate-11 uppercase"
              >
                Plan Name
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-name"
                  data-testid="trade-plan-name-input"
                  maxLength={120}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xl font-bold text-slate-12"
                  value={planName}
                  onChange={(e) => {
                    setPlanName(e.target.value);
                    setPlanNameError(null);
                    if (planNameSaveState === "saved")
                      setPlanNameSaveState("idle");
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
              {planNameError && (
                <Alert variant="error" className="mt-2">
                  {planNameError}
                </Alert>
              )}
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
              <label
                htmlFor="plan-symbol"
                className="mb-1 block text-xs tracking-wide text-slate-11 uppercase"
              >
                Instrument Symbol
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="plan-symbol"
                  data-testid="trade-plan-symbol-input"
                  maxLength={20}
                  className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12 sm:w-40"
                  value={instrumentSymbol}
                  onChange={(e) => {
                    setInstrumentSymbol(e.target.value);
                    setInstrumentSymbolError(null);
                    if (instrumentSymbolSaveState === "saved")
                      setInstrumentSymbolSaveState("idle");
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
              {instrumentSymbolError && (
                <Alert variant="error" className="mt-2">
                  {instrumentSymbolError}
                </Alert>
              )}
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
            <label
              htmlFor="plan-status"
              className="mb-1 block text-xs tracking-wide text-slate-11 uppercase"
            >
              Status
            </label>
            <select
              id="plan-status"
              value={tradePlan.status}
              disabled={isChangingStatus}
              onChange={(e) =>
                void handleStatusChange(e.target.value as TradePlanStatus)
              }
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-slate-12 focus:ring-1 focus:ring-slate-500 focus:outline-none"
            >
              <option value="idea">Idea</option>
              <option value="watching">Watching</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {tradePlan.status === "closed" && tradePlan.closedAt && (
          <p className="text-xs text-slate-11">
            Closed {new Date(tradePlan.closedAt).toLocaleDateString("en-US")}
          </p>
        )}

        {statusError && (
          <Alert variant="error" className="mt-3">
            {statusError}
          </Alert>
        )}
      </div>

      <NotesSection
        notes={notes}
        onAddNote={async (content, chartUrls) => {
          await addNote({ tradePlanId, content, chartUrls });
        }}
        onUpdateNote={async (noteId, content, chartUrls) => {
          await updateNoteM({
            noteId: noteId as Id<"notes">,
            content,
            chartUrls,
          });
        }}
      />

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-lg font-semibold text-slate-12"
            data-testid="trade-plan-trades-section-title"
          >
            Trades
          </h2>
          <Link
            href="/trades/new"
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
          >
            Add Trade
          </Link>
        </div>

        {inboxAcceptError && (
          <Alert
            variant="error"
            className="mb-3"
            onDismiss={() => setInboxAcceptError(null)}
          >
            {inboxAcceptError}
          </Alert>
        )}

        {trades.length === 0 && inboxTradesForPlan.length === 0 ? (
          <p className="text-sm text-slate-11">
            No trades linked to this plan yet.
          </p>
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
                  <th className="px-2 py-2">Portfolio / Action</th>
                </tr>
              </thead>
              <tbody>
                {inboxTradesForPlan.map(({ inboxTrade, matchType }) => {
                  const portfolioId = pendingPortfolioIds[inboxTrade._id] ?? "";
                  return (
                    <tr
                      key={inboxTrade._id}
                      className="border-b border-slate-700 bg-blue-900/20"
                    >
                      <td className="px-2 py-2 text-slate-11">
                        {inboxTrade.date
                          ? new Date(inboxTrade.date).toLocaleDateString(
                              "en-US",
                            )
                          : "---"}
                      </td>
                      <td className="px-2 py-2 text-slate-12">
                        {inboxTrade.ticker ?? "---"}{" "}
                        <Badge
                          variant={
                            matchType === "suggested" ? "info" : "neutral"
                          }
                        >
                          {matchType === "suggested" ? "Suggested" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-slate-11">
                        {accountNameByAccountId.get(
                          inboxTrade.brokerageAccountId ?? "",
                        ) ??
                          inboxTrade.brokerageAccountId ??
                          "---"}
                      </td>
                      <td className="px-2 py-2 text-slate-11">
                        <Badge
                          variant={
                            inboxTrade.side === "buy"
                              ? "success"
                              : inboxTrade.side === "sell"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {inboxTrade.side ?? "---"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-slate-11">
                        {inboxTrade.quantity ?? "---"}
                      </td>
                      <td className="px-2 py-2 text-slate-11">
                        {inboxTrade.price !== undefined
                          ? formatCurrency(inboxTrade.price)
                          : "---"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <select
                            aria-label={`Portfolio for ${inboxTrade.ticker || "trade"}`}
                            value={portfolioId}
                            onChange={(e) =>
                              setPendingPortfolioIds((prev) => ({
                                ...prev,
                                [inboxTrade._id]: e.target.value,
                              }))
                            }
                            className="h-7 rounded border border-slate-600 bg-slate-700 px-1 text-xs text-slate-12"
                          >
                            <option value="">No portfolio</option>
                            {portfolios?.map((p) => (
                              <option key={p._id} value={p._id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label={`Accept ${inboxTrade.ticker ?? "trade"} from inbox`}
                            onClick={() =>
                              void handleAcceptInboxTrade(
                                inboxTrade._id,
                                portfolioId,
                              )
                            }
                            className="rounded p-1.5 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
                            title="Accept"
                            disabled={acceptingInboxTradeIds.has(
                              inboxTrade._id,
                            )}
                          >
                            {acceptingInboxTradeIds.has(inboxTrade._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">
                      {new Date(trade.date).toLocaleDateString("en-US")}
                    </td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.brokerageAccountId
                        ? (accountNameByAccountId.get(
                            trade.brokerageAccountId,
                          ) ?? trade.brokerageAccountId)
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.quantity}
                    </td>
                    <td className="px-2 py-2 text-slate-11">
                      {formatCurrency(trade.price)}
                    </td>
                    <td className="px-2 py-2 text-slate-11">—</td>
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
