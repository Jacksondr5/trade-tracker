"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button, Card } from "~/components/ui";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseIBKRCSV } from "~/lib/imports/ibkr-parser";
import { parseKrakenCSV } from "~/lib/imports/kraken-parser";
import type { BrokerageSource, ParseResult } from "~/lib/imports/types";

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
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
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
  const [editNotes, setEditNotes] = useState("");
  const [editTradePlanId, setEditTradePlanId] = useState("");

  // Queries
  const inboxTrades = useQuery(api.imports.listInboxTrades);
  const openTradePlans = useQuery(api.tradePlans.listOpenTradePlans);

  // Mutations
  const importTradesMutation = useMutation(api.imports.importTrades);
  const acceptTrade = useMutation(api.imports.acceptTrade);
  const acceptAllTrades = useMutation(api.imports.acceptAllTrades);
  const deleteInboxTrade = useMutation(api.imports.deleteInboxTrade);
  const deleteAllInboxTrades = useMutation(api.imports.deleteAllInboxTrades);
  const updateInboxTrade = useMutation(api.imports.updateInboxTrade);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result =
        brokerage === "ibkr"
          ? parseIBKRCSV(content)
          : parseKrakenCSV(content);
      setParseResult(result);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.trades.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importTradesMutation({
        trades: parseResult.trades,
      });
      setImportResult(result);
      setParseResult(null);
      // Reset file input
      const fileInput = document.getElementById(
        "csv-file-input",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import failed",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = (trade: NonNullable<typeof inboxTrades>[number]) => {
    setEditingTradeId(trade._id);
    setEditDirection(trade.direction);
    setEditAssetType(trade.assetType);
    setEditNotes(trade.notes || "");
    setEditTradePlanId(
      trade.tradePlanId ? (trade.tradePlanId as string) : "",
    );
  };

  const handleSaveEdit = async () => {
    if (!editingTradeId) return;
    try {
      await updateInboxTrade({
        assetType: editAssetType,
        direction: editDirection,
        notes: editNotes || undefined,
        tradePlanId: editTradePlanId
          ? (editTradePlanId as Id<"tradePlans">)
          : undefined,
        tradeId: editingTradeId,
      });
      setEditingTradeId(null);
    } catch (error) {
      console.error("Failed to update trade:", error);
    }
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
                  setParseResult(null);
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
                onChange={handleFileChange}
                className="text-slate-12 text-sm file:mr-4 file:rounded-md file:border file:border-slate-600 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-slate-300 file:hover:bg-slate-600"
              />
            </div>
          </div>

          {/* Parse Preview */}
          {parseResult && (
            <div className="rounded-md border border-slate-600 bg-slate-700 p-4">
              <p className="text-slate-12 text-sm">
                Parsed{" "}
                <span className="font-semibold">
                  {parseResult.trades.length}
                </span>{" "}
                trade{parseResult.trades.length !== 1 ? "s" : ""} from{" "}
                {brokerage.toUpperCase()} CSV.
              </p>
              {parseResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-yellow-400">
                    {parseResult.errors.length} row(s) had errors:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300">
                    {parseResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {parseResult.errors.length > 5 && (
                      <li>
                        ...and {parseResult.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                <Button
                  dataTestId="import-trades-button"
                  onClick={() => void handleImport()}
                  disabled={
                    isImporting || parseResult.trades.length === 0
                  }
                >
                  {isImporting
                    ? "Importing..."
                    : `Import ${parseResult.trades.length} Trade${parseResult.trades.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}

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
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Trade Plan
                </label>
                <select
                  value={editTradePlanId}
                  onChange={(e) => setEditTradePlanId(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="">None</option>
                  {openTradePlans?.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} ({plan.instrumentSymbol})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="text-slate-12 h-8 w-full rounded border border-slate-600 bg-slate-700 px-2 text-sm"
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
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Type
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Source
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Account
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
                    className={`hover:bg-slate-800/50 ${editingTradeId === trade._id ? "bg-slate-800/30" : ""}`}
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
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.direction}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {formatCurrency(trade.price)}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.quantity}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.assetType}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.source?.toUpperCase() ?? "---"}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.brokerageAccountId || "---"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() =>
                            void acceptTrade({
                              tradeId: trade._id,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900/50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleEdit(trade)}
                          className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            void deleteInboxTrade({
                              tradeId: trade._id,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/50"
                        >
                          Delete
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
