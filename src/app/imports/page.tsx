"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button, Card } from "~/components/ui";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseIBKRCSV } from "~/lib/imports/ibkr-parser";
import { parseKrakenCSV } from "~/lib/imports/kraken-parser";
import type { BrokerageSource } from "~/lib/imports/types";
import { Check, Pencil, Trash2 } from "lucide-react";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export default function ImportsPage() {
  // Upload state
  const [brokerage, setBrokerage] = useState<BrokerageSource>("ibkr");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Edit state
  const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(
    null,
  );
  const [editDirection, setEditDirection] = useState<"long" | "short">("long");
  const [editAssetType, setEditAssetType] = useState<"stock" | "crypto">(
    "stock",
  );

  // Inline edit state (per-row)
  const [inlineNotes, setInlineNotes] = useState<Record<string, string>>({});
  const [inlineTradePlanIds, setInlineTradePlanIds] = useState<
    Record<string, string>
  >({});

  // Queries
  const inboxTrades = useQuery(api.imports.listInboxTrades);
  const openTradePlans = useQuery(api.tradePlans.listOpenTradePlans);

  // Initialize inline state from loaded inbox trades
  useEffect(() => {
    if (!inboxTrades) return;
    setInlineNotes((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        if (!(trade._id in next)) {
          next[trade._id] = trade.notes ?? "";
        }
      }
      return next;
    });
    setInlineTradePlanIds((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        if (!(trade._id in next)) {
          next[trade._id] = trade.tradePlanId
            ? (trade.tradePlanId as string)
            : "";
        }
      }
      return next;
    });
  }, [inboxTrades]);

  // Mutations
  const importTradesMutation = useMutation(api.imports.importTrades);
  const acceptTrade = useMutation(api.imports.acceptTrade);
  const acceptAllTrades = useMutation(api.imports.acceptAllTrades);
  const deleteInboxTrade = useMutation(api.imports.deleteInboxTrade);
  const deleteAllInboxTrades = useMutation(api.imports.deleteAllInboxTrades);
  const updateInboxTrade = useMutation(api.imports.updateInboxTrade);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportError(null);
    setIsImporting(true);

    try {
      const content = await file.text();
      const parseResult =
        brokerage === "ibkr"
          ? parseIBKRCSV(content)
          : parseKrakenCSV(content);

      if (parseResult.trades.length === 0) {
        setImportError(
          parseResult.errors.length > 0
            ? `No trades parsed. Errors: ${parseResult.errors.slice(0, 3).join("; ")}`
            : "No trades found in CSV.",
        );
        return;
      }

      const result = await importTradesMutation({
        trades: parseResult.trades,
      });
      setImportResult(result);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import failed",
      );
    } finally {
      setIsImporting(false);
      // Reset file input
      const fileInput = document.getElementById(
        "csv-file-input",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    }
  };

  const handleEdit = (trade: NonNullable<typeof inboxTrades>[number]) => {
    setEditingTradeId(trade._id);
    setEditDirection(trade.direction);
    setEditAssetType(trade.assetType);
  };

  const handleSaveEdit = async () => {
    if (!editingTradeId) return;
    try {
      await updateInboxTrade({
        assetType: editAssetType,
        direction: editDirection,
        tradeId: editingTradeId,
      });
      setEditingTradeId(null);
    } catch (error) {
      console.error("Failed to update trade:", error);
    }
  };

  const handleAccept = (tradeId: Id<"trades">) => {
    const notes = inlineNotes[tradeId] || undefined;
    const tradePlanId = inlineTradePlanIds[tradeId] || undefined;
    void acceptTrade({
      notes,
      tradePlanId: tradePlanId
        ? (tradePlanId as Id<"tradePlans">)
        : undefined,
      tradeId,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">
        Import Trades
      </h1>

      {/* Upload Section */}
      <Card className="mb-8 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">
          Upload CSV
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="brokerage-select"
                className="text-slate-12 mb-1 block text-sm font-medium"
              >
                Brokerage
              </label>
              <select
                id="brokerage-select"
                value={brokerage}
                onChange={(e) => {
                  setBrokerage(e.target.value as BrokerageSource);
                  setImportResult(null);
                }}
                className="text-slate-12 h-9 rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="ibkr">Interactive Brokers (IBKR)</option>
                <option value="kraken">Kraken</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="csv-file-input"
                className="text-slate-12 mb-1 block text-sm font-medium"
              >
                CSV File
              </label>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={(e) => void handleFileChange(e)}
                className="text-slate-12 text-sm file:mr-4 file:rounded-md file:border file:border-slate-600 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-slate-300 file:hover:bg-slate-600"
              />
            </div>
            {isImporting && (
              <div className="text-slate-11 text-sm">Importing...</div>
            )}
          </div>

          {/* Import Result */}
          {importResult && (
            <div className="text-slate-12 rounded-md bg-green-900/50 p-4 text-sm">
              Imported{" "}
              <span className="font-semibold">{importResult.imported}</span>{" "}
              trade{importResult.imported !== 1 ? "s" : ""}.
              {importResult.skipped > 0 && (
                <>
                  {" "}
                  Skipped{" "}
                  <span className="font-semibold">
                    {importResult.skipped}
                  </span>{" "}
                  duplicate{importResult.skipped !== 1 ? "s" : ""}.
                </>
              )}
            </div>
          )}

          {importError && (
            <div className="rounded-md bg-red-900/50 p-4 text-sm text-red-300">
              {importError}
            </div>
          )}
        </div>
      </Card>

      {/* Inbox Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-slate-12 text-lg font-semibold">
            Inbox
            {inboxTrades && inboxTrades.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({inboxTrades.length} pending)
              </span>
            )}
          </h2>
          {inboxTrades && inboxTrades.length > 0 && (
            <div className="flex gap-2">
              <Button
                dataTestId="accept-all-trades-button"
                onClick={() => void acceptAllTrades()}
                variant="outline"
              >
                Accept All ({inboxTrades.length})
              </Button>
              <Button
                dataTestId="delete-all-trades-button"
                onClick={() => void deleteAllInboxTrades()}
                variant="outline"
              >
                Delete All
              </Button>
            </div>
          )}
        </div>

        {/* Edit Form */}
        {editingTradeId && (
          <Card className="mb-4 bg-slate-800 p-4">
            <h3 className="text-slate-12 mb-3 text-sm font-semibold">
              Edit Trade
            </h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Direction
                </label>
                <select
                  value={editDirection}
                  onChange={(e) =>
                    setEditDirection(
                      e.target.value as "long" | "short",
                    )
                  }
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Asset Type
                </label>
                <select
                  value={editAssetType}
                  onChange={(e) =>
                    setEditAssetType(
                      e.target.value as "stock" | "crypto",
                    )
                  }
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button dataTestId="save-edit-button" onClick={() => void handleSaveEdit()}>
                  Save
                </Button>
                <Button
                  dataTestId="cancel-edit-button"
                  variant="outline"
                  onClick={() => setEditingTradeId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Inbox Table */}
        {inboxTrades === undefined ? (
          <div className="text-slate-11">Loading...</div>
        ) : inboxTrades.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
            <p className="text-slate-11">
              No trades pending review. Upload a CSV to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full table-auto">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Date
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Ticker
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Side
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Direction
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Price
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Qty
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Value
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Account
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Trade Plan
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Notes
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 bg-slate-900">
                {inboxTrades.map((trade) => (
                  <tr
                    key={trade._id}
                    className={`hover:bg-slate-800/50 ${editingTradeId === trade._id ? "ring-2 ring-blue-500 bg-blue-900/20" : ""}`}
                  >
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">
                      {formatDate(trade.date)}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                      {trade.ticker}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`text-slate-12 rounded px-2 py-0.5 ${
                          trade.side === "buy"
                            ? "border border-green-700 bg-green-900/50"
                            : "border border-red-700 bg-red-900/50"
                        }`}
                      >
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`text-slate-12 rounded px-2 py-0.5 ${
                          trade.direction === "long"
                            ? "border border-blue-700 bg-blue-900/50"
                            : "border border-red-700 bg-red-900/50"
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {formatCurrency(trade.price)}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.quantity}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {formatCurrency(trade.price * trade.quantity)}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.brokerageAccountId || "---"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={inlineTradePlanIds[trade._id] ?? ""}
                        onChange={(e) =>
                          setInlineTradePlanIds((prev) => ({
                            ...prev,
                            [trade._id]: e.target.value,
                          }))
                        }
                        className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                      >
                        <option value="">None</option>
                        {openTradePlans?.map((plan) => (
                          <option key={plan._id} value={plan._id}>
                            {plan.name} ({plan.instrumentSymbol})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="text"
                        value={inlineNotes[trade._id] ?? ""}
                        onChange={(e) =>
                          setInlineNotes((prev) => ({
                            ...prev,
                            [trade._id]: e.target.value,
                          }))
                        }
                        placeholder="Notes..."
                        className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-2 text-xs"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleAccept(trade._id)}
                          className="rounded p-1.5 text-green-400 hover:bg-green-900/50"
                          title="Accept"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(trade)}
                          className="rounded p-1.5 text-blue-400 hover:bg-blue-900/50"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            void deleteInboxTrade({
                              tradeId: trade._id,
                            })
                          }
                          className="rounded p-1.5 text-red-400 hover:bg-red-900/50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
