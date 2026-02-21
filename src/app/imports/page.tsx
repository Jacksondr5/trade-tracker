"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button, Card } from "~/components/ui";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseIBKRCSV } from "~/lib/imports/ibkr-parser";
import { parseKrakenCSV } from "~/lib/imports/kraken-parser";
import type { BrokerageSource } from "../../../shared/imports/types";
import { Check, Pencil, Trash2 } from "lucide-react";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
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

function toDateTimeLocalValue(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function ImportsPage() {
  // Upload state
  const [brokerage, setBrokerage] = useState<BrokerageSource>("ibkr");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skippedDuplicates: number;
    withValidationErrors: number;
    withWarnings: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Edit state
  const [editingTradeId, setEditingTradeId] = useState<Id<"inboxTrades"> | null>(
    null,
  );
  const [editDirection, setEditDirection] = useState<"long" | "short">("long");
  const [editAssetType, setEditAssetType] = useState<"stock" | "crypto">(
    "stock",
  );
  const [editSide, setEditSide] = useState<"buy" | "sell" | "">("");
  const [editTicker, setEditTicker] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editDate, setEditDate] = useState("");

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

  const persistTradePlanSelection = (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => {
    void updateInboxTrade({
      inboxTradeId,
      tradePlanId: value ? (value as Id<"tradePlans">) : null,
    }).catch((error) => {
      setImportError(
        error instanceof Error ? error.message : "Failed to update trade plan",
      );
    });
  };

  const persistNotes = (inboxTradeId: Id<"inboxTrades">, value: string) => {
    void updateInboxTrade({
      inboxTradeId,
      notes: value || null,
    }).catch((error) => {
      setImportError(
        error instanceof Error ? error.message : "Failed to update notes",
      );
    });
  };

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
    setEditDirection(trade.direction ?? "long");
    setEditAssetType(trade.assetType ?? "stock");
    setEditSide(trade.side ?? "");
    setEditTicker(trade.ticker ?? "");
    setEditPrice(trade.price !== undefined ? String(trade.price) : "");
    setEditQuantity(trade.quantity !== undefined ? String(trade.quantity) : "");
    setEditDate(toDateTimeLocalValue(trade.date));
  };

  const handleSaveEdit = async () => {
    if (!editingTradeId) return;
    if (editPrice.trim() && !Number.isFinite(Number(editPrice))) {
      setImportError("Price must be a valid number");
      return;
    }
    if (editQuantity.trim() && !Number.isFinite(Number(editQuantity))) {
      setImportError("Quantity must be a valid number");
      return;
    }
    try {
      await updateInboxTrade({
        assetType: editAssetType,
        date: editDate ? new Date(editDate).getTime() : null,
        direction: editDirection,
        inboxTradeId: editingTradeId,
        price: editPrice.trim() ? Number(editPrice) : null,
        quantity: editQuantity.trim() ? Number(editQuantity) : null,
        side: editSide || null,
        ticker: editTicker.trim() || null,
      });
      setEditingTradeId(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to save edit");
    }
  };

  const handleAccept = (inboxTradeId: Id<"inboxTrades">) => {
    const trade = inboxTrades?.find((t) => t._id === inboxTradeId);
    if (!trade) return;
    if (!isTradeReadyForAcceptance(trade)) return;

    const tradePlanId = inlineTradePlanIds[inboxTradeId] || undefined;
    const notesValue = inlineNotes[inboxTradeId] || undefined;
    void acceptTrade({
      inboxTradeId,
      notes: notesValue,
      tradePlanId: tradePlanId ? (tradePlanId as Id<"tradePlans">) : undefined,
    }).then((result) => {
      if (!result.accepted && result.error) {
        setImportError(result.error);
      }
    });
  };

  const isTradeReadyForAcceptance = (
    trade: NonNullable<typeof inboxTrades>[number],
  ): boolean => {
    return !!(
      trade.ticker &&
      trade.assetType &&
      trade.side &&
      trade.direction &&
      trade.date !== undefined &&
      Number.isFinite(trade.date) &&
      trade.price !== undefined &&
      Number.isFinite(trade.price) &&
      trade.price > 0 &&
      trade.quantity !== undefined &&
      Number.isFinite(trade.quantity) &&
      trade.quantity > 0
    );
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
              {importResult.skippedDuplicates > 0 && (
                <>
                  {" "}
                  Skipped{" "}
                  <span className="font-semibold">
                    {importResult.skippedDuplicates}
                  </span>{" "}
                  duplicate{importResult.skippedDuplicates !== 1 ? "s" : ""}.
                </>
              )}
              {importResult.withValidationErrors > 0 && (
                <>
                  {" "}
                  <span className="font-semibold">
                    {importResult.withValidationErrors}
                  </span>{" "}
                  need review.
                </>
              )}
              {importResult.withWarnings > 0 && (
                <>
                  {" "}
                  <span className="font-semibold">{importResult.withWarnings}</span>{" "}
                  with warnings.
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
                onClick={() =>
                  void (async () => {
                    try {
                      if (inboxTrades) {
                        await Promise.all(
                          inboxTrades.map((trade) => {
                            const selected = inlineTradePlanIds[trade._id] ?? "";
                            const notes = inlineNotes[trade._id] ?? "";
                            const tradePlanChanged =
                              selected !==
                              (trade.tradePlanId ? String(trade.tradePlanId) : "");
                            const notesChanged = notes !== (trade.notes ?? "");
                            if (!tradePlanChanged && !notesChanged) return Promise.resolve();
                            return updateInboxTrade({
                              inboxTradeId: trade._id,
                              notes: notes || null,
                              tradePlanId: selected
                                ? (selected as Id<"tradePlans">)
                                : null,
                            });
                          }),
                        );
                      }

                      const result = await acceptAllTrades();
                      const messages: string[] = [];
                      if (result.accepted > 0) messages.push(`Accepted ${result.accepted}`);
                      if (result.skippedInvalid > 0) messages.push(`${result.skippedInvalid} need review`);
                      if (result.errors.length > 0) messages.push(`Errors: ${result.errors.slice(0, 3).join("; ")}`);
                      if (result.skippedInvalid > 0 || result.errors.length > 0) {
                        setImportError(messages.join(". "));
                      }
                    } catch (error) {
                      setImportError(
                        error instanceof Error ? error.message : "Accept all failed",
                      );
                    }
                  })()
                }
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
                  Ticker
                </label>
                <input
                  type="text"
                  value={editTicker}
                  onChange={(e) => setEditTicker(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Side
                </label>
                <select
                  value={editSide}
                  onChange={(e) =>
                    setEditSide(e.target.value as "buy" | "sell" | "")
                  }
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="">---</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
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
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Price
                </label>
                <input
                  type="number"
                  step="any"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Quantity
                </label>
                <input
                  type="number"
                  step="any"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Date
                </label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                />
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
                      {trade.date !== undefined ? formatDate(trade.date) : "---"}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                      {trade.ticker ?? "---"}
                      {(trade.validationErrors.length > 0 ||
                        trade.validationWarnings.length > 0) && (
                        <div className="mt-1 space-y-1 text-xs">
                          {trade.validationErrors.slice(0, 2).map((error) => (
                            <div key={error} className="text-red-300">
                              Error: {error}
                            </div>
                          ))}
                          {trade.validationWarnings.slice(0, 2).map((warning) => (
                            <div key={warning} className="text-amber-300">
                              Warning: {warning}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {trade.side ? (
                        <span
                          className={`text-slate-12 rounded px-2 py-0.5 ${trade.side === "buy"
                              ? "border border-green-700 bg-green-900/50"
                              : "border border-red-700 bg-red-900/50"
                            }`}
                        >
                          {trade.side.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-slate-11">---</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {trade.direction ? (
                        <span
                          className={`text-slate-12 rounded px-2 py-0.5 ${trade.direction === "long"
                              ? "border border-blue-700 bg-blue-900/50"
                              : "border border-red-700 bg-red-900/50"
                            }`}
                        >
                          {trade.direction.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-slate-11">---</span>
                      )}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.price !== undefined ? formatCurrency(trade.price) : "---"}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.quantity ?? "---"}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.price !== undefined && trade.quantity !== undefined
                        ? formatCurrency(trade.price * trade.quantity)
                        : "---"}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.brokerageAccountId || "---"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={inlineTradePlanIds[trade._id] ?? ""}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setInlineTradePlanIds((prev) => ({
                            ...prev,
                            [trade._id]: nextValue,
                          }));
                          persistTradePlanSelection(trade._id, nextValue);
                        }}
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
                        onBlur={(e) => persistNotes(trade._id, e.target.value)}
                        placeholder="Notes..."
                        className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-2 text-xs"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Accept trade"
                          onClick={() => handleAccept(trade._id)}
                          disabled={!isTradeReadyForAcceptance(trade)}
                          className="rounded p-1.5 text-green-400 hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            isTradeReadyForAcceptance(trade)
                              ? "Accept"
                              : "Missing required fields"
                          }
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Edit trade"
                          onClick={() => handleEdit(trade)}
                          className="rounded p-1.5 text-blue-400 hover:bg-blue-900/50"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete trade"
                          onClick={() =>
                            void deleteInboxTrade({
                              inboxTradeId: trade._id,
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
