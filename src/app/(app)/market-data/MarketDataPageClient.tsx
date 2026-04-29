"use client";

import { Preloaded, useAction, useMutation, usePreloadedQuery } from "convex/react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Doc, Id } from "~/convex/_generated/dataModel";
import {
  APP_PAGE_TITLES,
  MARKET_DATA_TEST_IDS,
  getMarketDataCancelProviderSymbolButtonTestId,
  getMarketDataEditProviderSymbolButtonTestId,
  getMarketDataIgnoreInstrumentButtonTestId,
  getMarketDataInstrumentRowTestId,
  getMarketDataInstrumentStatusTestId,
  getMarketDataProviderSymbolInputTestId,
  getMarketDataSaveProviderSymbolButtonTestId,
} from "../../../../shared/e2e/testIds";

type Instrument = Doc<"marketDataInstruments">;
type ResolutionStatus = Instrument["resolutionStatus"];

const STATUS_LABELS: Record<ResolutionStatus, string> = {
  needs_review: "Needs review",
  resolved: "Resolved",
  ignored: "Ignored",
};

const STATUS_BADGE_VARIANT: Record<
  ResolutionStatus,
  "danger" | "success" | "warning"
> = {
  needs_review: "danger",
  resolved: "success",
  ignored: "warning",
};

const ASSET_TYPE_LABELS: Record<Instrument["assetType"], string> = {
  stock: "Stock",
  crypto: "Crypto",
};

function formatTimestamp(value: number | undefined): string {
  if (value === undefined) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

export default function MarketDataPageClient({
  preloadedInstruments,
}: {
  preloadedInstruments: Preloaded<typeof api.marketData.listInstruments>;
}) {
  const instruments = usePreloadedQuery(preloadedInstruments);

  const setProviderSymbol = useAction(api.marketData.setProviderSymbol);
  const setInstrumentIgnored = useMutation(
    api.marketData.setInstrumentIgnored,
  );

  const [editingInstrumentId, setEditingInstrumentId] =
    useState<Id<"marketDataInstruments"> | null>(null);
  const [providerSymbolDraft, setProviderSymbolDraft] = useState("");
  const [pendingInstrumentId, setPendingInstrumentId] =
    useState<Id<"marketDataInstruments"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { needsReview, others } = useMemo(() => {
    const needsReview: Instrument[] = [];
    const others: Instrument[] = [];
    for (const instrument of instruments) {
      if (instrument.resolutionStatus === "needs_review") {
        needsReview.push(instrument);
      } else {
        others.push(instrument);
      }
    }
    return { needsReview, others };
  }, [instruments]);

  const startEditing = (instrument: Instrument) => {
    if (pendingInstrumentId !== null) return;
    setEditingInstrumentId(instrument._id);
    setProviderSymbolDraft(instrument.providerSymbol ?? instrument.symbol);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const cancelEditing = () => {
    setEditingInstrumentId(null);
    setProviderSymbolDraft("");
    setErrorMessage(null);
  };

  const saveProviderSymbol = async (instrument: Instrument) => {
    const trimmed = providerSymbolDraft.trim();
    if (!trimmed) {
      setErrorMessage("Provider symbol is required.");
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingInstrumentId(instrument._id);
    try {
      await setProviderSymbol({
        instrumentId: instrument._id,
        providerSymbol: trimmed,
      });
      setStatusMessage(
        `Saved provider symbol for ${instrument.symbol}.`,
      );
      setEditingInstrumentId(null);
      setProviderSymbolDraft("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to validate provider symbol.",
      );
    } finally {
      setPendingInstrumentId(null);
    }
  };

  const ignoreInstrument = async (instrument: Instrument) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingInstrumentId(instrument._id);
    try {
      await setInstrumentIgnored({ instrumentId: instrument._id });
      setStatusMessage(
        `Marked ${instrument.symbol} as ignored. Valuation coverage may be partial.`,
      );
      if (editingInstrumentId === instrument._id) {
        setEditingInstrumentId(null);
        setProviderSymbolDraft("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to ignore instrument.",
      );
    } finally {
      setPendingInstrumentId(null);
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.marketData}
        >
          Market Data
        </h1>
        <p className="text-sm text-slate-11">
          Review instrument mappings used for portfolio valuation. Resolve a
          provider symbol to unblock pricing, or mark unsupported instruments
          as ignored. Ignored instruments may produce partial valuation
          coverage.
        </p>
      </div>

      {errorMessage ? (
        <Alert
          variant="error"
          data-testid={MARKET_DATA_TEST_IDS.errorAlert}
          onDismiss={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      ) : null}
      {statusMessage ? (
        <Alert variant="success" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      ) : null}

      {instruments.length === 0 ? (
        <EmptyState
          dataTestId={MARKET_DATA_TEST_IDS.emptyState}
          title="No market data instruments yet"
          description="Instruments are created automatically when you record or import trades. They will appear here once you have activity."
        />
      ) : (
        <>
          <Card data-testid={MARKET_DATA_TEST_IDS.reviewSection}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-11" />
                Needs review
              </CardTitle>
              <CardDescription>
                Instruments that could not be auto-matched to Twelve Data.
                Provide a provider symbol or mark them ignored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {needsReview.length === 0 ? (
                <EmptyState
                  dataTestId={MARKET_DATA_TEST_IDS.noReviewState}
                  title="Nothing to review"
                  description="All known instruments are resolved or have been marked ignored."
                />
              ) : (
                <InstrumentTable
                  tableTestId={MARKET_DATA_TEST_IDS.tableNeedsReview}
                  instruments={needsReview}
                  editingInstrumentId={editingInstrumentId}
                  pendingInstrumentId={pendingInstrumentId}
                  providerSymbolDraft={providerSymbolDraft}
                  onChangeDraft={setProviderSymbolDraft}
                  onStartEditing={startEditing}
                  onCancelEditing={cancelEditing}
                  onSaveProviderSymbol={saveProviderSymbol}
                  onIgnoreInstrument={ignoreInstrument}
                />
              )}
            </CardContent>
          </Card>

          {others.length > 0 ? (
            <Card data-testid={MARKET_DATA_TEST_IDS.resolvedSection}>
              <CardHeader>
                <CardTitle>All instruments</CardTitle>
                <CardDescription>
                  Resolved and ignored instruments. Update the provider symbol
                  here if a mapping changes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InstrumentTable
                  tableTestId={MARKET_DATA_TEST_IDS.tableAllInstruments}
                  instruments={others}
                  editingInstrumentId={editingInstrumentId}
                  pendingInstrumentId={pendingInstrumentId}
                  providerSymbolDraft={providerSymbolDraft}
                  onChangeDraft={setProviderSymbolDraft}
                  onStartEditing={startEditing}
                  onCancelEditing={cancelEditing}
                  onSaveProviderSymbol={saveProviderSymbol}
                  onIgnoreInstrument={ignoreInstrument}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

interface InstrumentTableProps {
  tableTestId: string;
  instruments: Instrument[];
  editingInstrumentId: Id<"marketDataInstruments"> | null;
  pendingInstrumentId: Id<"marketDataInstruments"> | null;
  providerSymbolDraft: string;
  onChangeDraft: (value: string) => void;
  onStartEditing: (instrument: Instrument) => void;
  onCancelEditing: () => void;
  onSaveProviderSymbol: (instrument: Instrument) => Promise<void> | void;
  onIgnoreInstrument: (instrument: Instrument) => Promise<void> | void;
}

function InstrumentTable({
  tableTestId,
  instruments,
  editingInstrumentId,
  pendingInstrumentId,
  providerSymbolDraft,
  onChangeDraft,
  onStartEditing,
  onCancelEditing,
  onSaveProviderSymbol,
  onIgnoreInstrument,
}: InstrumentTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-6">
      <table
        className="w-full table-auto"
        data-testid={tableTestId}
      >
        <thead className="bg-slate-3">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Symbol
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Asset
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Provider
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Provider symbol
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Status
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Last error
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-11">
              Updated
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-slate-11">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-6 bg-slate-2">
          {instruments.map((instrument) => {
            const isEditing = editingInstrumentId === instrument._id;
            const isPending = pendingInstrumentId === instrument._id;
            const editTestId = getMarketDataEditProviderSymbolButtonTestId(
              instrument.assetType,
              instrument.symbol,
            );
            const inputTestId = getMarketDataProviderSymbolInputTestId(
              instrument.assetType,
              instrument.symbol,
            );
            const saveTestId = getMarketDataSaveProviderSymbolButtonTestId(
              instrument.assetType,
              instrument.symbol,
            );
            const cancelTestId = getMarketDataCancelProviderSymbolButtonTestId(
              instrument.assetType,
              instrument.symbol,
            );
            const ignoreTestId = getMarketDataIgnoreInstrumentButtonTestId(
              instrument.assetType,
              instrument.symbol,
            );

            return (
              <tr
                key={instrument._id}
                data-testid={getMarketDataInstrumentRowTestId(
                  instrument.assetType,
                  instrument.symbol,
                )}
                className="hover:bg-slate-3/40"
              >
                <td className="px-3 py-2 font-mono text-sm text-slate-12">
                  {instrument.symbol}
                </td>
                <td className="px-3 py-2 text-sm text-slate-11">
                  {ASSET_TYPE_LABELS[instrument.assetType]}
                </td>
                <td className="px-3 py-2 text-sm text-slate-11">
                  {instrument.provider}
                </td>
                <td className="px-3 py-2 text-sm text-slate-12">
                  {isEditing ? (
                    <Input
                      dataTestId={inputTestId}
                      disabled={isPending}
                      value={providerSymbolDraft}
                      onChange={(event) => onChangeDraft(event.target.value)}
                      placeholder="e.g. AAPL or BTC/USD"
                    />
                  ) : (
                    <span className="font-mono">
                      {instrument.providerSymbol ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-sm">
                  <Badge
                    variant={STATUS_BADGE_VARIANT[instrument.resolutionStatus]}
                    data-testid={getMarketDataInstrumentStatusTestId(
                      instrument.assetType,
                      instrument.symbol,
                    )}
                  >
                    {STATUS_LABELS[instrument.resolutionStatus]}
                  </Badge>
                </td>
                <td className="max-w-[18rem] px-3 py-2 text-xs text-slate-11">
                  <span
                    className="line-clamp-2 break-words"
                    title={instrument.lastError ?? ""}
                  >
                    {instrument.lastError ?? "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-11">
                  {formatTimestamp(
                    instrument.lastResolvedAt ?? instrument.updatedAt,
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        dataTestId={saveTestId}
                        aria-label={`Save provider symbol for ${instrument.symbol}`}
                        size="sm"
                        isLoading={isPending}
                        disabled={isPending || !providerSymbolDraft.trim()}
                        onClick={() => void onSaveProviderSymbol(instrument)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        dataTestId={cancelTestId}
                        aria-label={`Cancel editing provider symbol for ${instrument.symbol}`}
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={onCancelEditing}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button
                        dataTestId={editTestId}
                        aria-label={`Edit provider symbol for ${instrument.symbol}`}
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => onStartEditing(instrument)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        dataTestId={ignoreTestId}
                        size="sm"
                        variant="ghost"
                        disabled={
                          isPending ||
                          instrument.resolutionStatus === "ignored"
                        }
                        onClick={() => void onIgnoreInstrument(instrument)}
                        title="Mark ignored"
                      >
                        Ignore
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
