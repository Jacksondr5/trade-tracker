import { Check, Pencil, Trash2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../shared/imports/constants";
import type { InboxTrade, OpenTradePlanOption } from "../types";
import {
  formatCurrency,
  formatDate,
  isTradeReadyForAcceptance,
} from "../utils";
import { cn } from "~/lib/utils";

interface InboxTableProps {
  accountLabelByKey: Map<string, string>;
  editingTradeId: Id<"inboxTrades"> | null;
  inlineNotes: Record<string, string>;
  inlineTradePlanIds: Record<string, string>;
  inboxTrades: InboxTrade[] | undefined;
  onAccept: (inboxTradeId: Id<"inboxTrades">) => void;
  onDelete: (inboxTradeId: Id<"inboxTrades">) => void;
  onEdit: (trade: InboxTrade) => void;
  onInlineNotesBlur: (inboxTradeId: Id<"inboxTrades">, value: string) => void;
  onInlineNotesChange: (inboxTradeId: Id<"inboxTrades">, value: string) => void;
  onInlineTradePlanChange: (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => void;
  openTradePlans: OpenTradePlanOption[] | undefined;
}

export function InboxTable({
  accountLabelByKey,
  editingTradeId,
  inlineNotes,
  inlineTradePlanIds,
  inboxTrades,
  onAccept,
  onDelete,
  onEdit,
  onInlineNotesBlur,
  onInlineNotesChange,
  onInlineTradePlanChange,
  openTradePlans,
}: InboxTableProps) {
  if (inboxTrades === undefined) {
    return <div className="text-slate-11">Loading...</div>;
  }

  if (inboxTrades.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
        <p className="text-slate-11">
          No trades pending review. Upload a CSV to get started.
        </p>
      </div>
    );
  }

  return (
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
          {inboxTrades.map((trade) => {
            const accountFriendlyName = trade.brokerageAccountId
              ? accountLabelByKey.get(
                  `${trade.source}|${trade.brokerageAccountId}`,
                )
              : null;

            return (
              <tr
                key={trade._id}
                className={cn("hover:bg-slate-800/50", {
                  "bg-blue-900/20 ring-2 ring-blue-500":
                    editingTradeId === trade._id,
                })}
              >
                <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">
                  {trade.date !== undefined ? formatDate(trade.date) : "---"}
                </td>
                <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                  {trade.ticker ?? "---"}
                  {(trade.validationErrors.length > 0 ||
                    trade.validationWarnings.length > 0) && (
                    <div className="mt-1 space-y-1 text-xs">
                      {trade.validationErrors
                        .slice(0, 2)
                        .map((error, index) => (
                          <div
                            key={`${trade._id}-error-${index}`}
                            className="text-red-300"
                          >
                            Error: {error}
                          </div>
                        ))}
                      {trade.validationWarnings
                        .slice(0, 2)
                        .map((warning, index) => (
                          <div
                            key={`${trade._id}-warning-${index}`}
                            className="text-amber-300"
                          >
                            Warning: {warning}
                          </div>
                        ))}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {trade.side ? (
                    <span
                      className={cn("text-slate-12 rounded px-2 py-0.5", {
                        "border border-green-700 bg-green-900/50":
                          trade.side === "buy",
                        "border border-red-700 bg-red-900/50":
                          trade.side !== "buy",
                      })}
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
                      className={cn("text-slate-12 rounded px-2 py-0.5", {
                        "border border-blue-700 bg-blue-900/50":
                          trade.direction === "long",
                        "border border-red-700 bg-red-900/50":
                          trade.direction !== "long",
                      })}
                    >
                      {trade.direction.toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-slate-11">---</span>
                  )}
                </td>
                <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                  {trade.price !== undefined
                    ? formatCurrency(trade.price)
                    : "---"}
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
                  {trade.brokerageAccountId
                    ? accountFriendlyName
                      ? isKrakenDefaultAccountId(trade.brokerageAccountId)
                        ? accountFriendlyName
                        : `${accountFriendlyName} (${trade.brokerageAccountId})`
                      : isKrakenDefaultAccountId(trade.brokerageAccountId)
                        ? KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME
                        : trade.brokerageAccountId
                    : "---"}
                </td>
                <td className="px-4 py-3 text-sm">
                  <select
                    value={inlineTradePlanIds[trade._id] ?? ""}
                    onChange={(e) =>
                      onInlineTradePlanChange(trade._id, e.target.value)
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
                      onInlineNotesChange(trade._id, e.target.value)
                    }
                    onBlur={(e) => onInlineNotesBlur(trade._id, e.target.value)}
                    placeholder="Notes..."
                    className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-2 text-xs"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      aria-label="Accept trade"
                      onClick={() => onAccept(trade._id)}
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
                      onClick={() => onEdit(trade)}
                      className="rounded p-1.5 text-blue-400 hover:bg-blue-900/50"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete trade"
                      onClick={() => onDelete(trade._id)}
                      className="rounded p-1.5 text-red-400 hover:bg-red-900/50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
