import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Badge } from "~/components/ui";
import { cn } from "~/lib/utils";

interface PortfolioOption {
  _id: Id<"portfolios">;
  name: string;
}

interface InboxTableProps {
  accountLabelByKey: Map<string, string>;
  campaigns:
    | Array<{ _id: Id<"campaigns">; name: string; status: string }>
    | undefined;
  editingTradeId: Id<"inboxTrades"> | null;
  inlineNotes: Record<string, string>;
  inlinePortfolioIds: Record<string, string>;
  inlineTradePlanIds: Record<string, string>;
  inboxTrades: InboxTrade[] | undefined;
  onAccept: (inboxTradeId: Id<"inboxTrades">) => void;
  onDelete: (inboxTradeId: Id<"inboxTrades">) => void;
  onEdit: (trade: InboxTrade) => void;
  onInlineNotesBlur: (inboxTradeId: Id<"inboxTrades">, value: string) => void;
  onInlineNotesChange: (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => void;
  onInlinePortfolioChange: (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => void;
  onInlineTradePlanChange: (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => void;
  onQuickCreateTradePlan: (
    inboxTradeId: Id<"inboxTrades">,
    args: {
      name: string;
      instrumentSymbol: string;
      campaignId?: Id<"campaigns">;
    },
  ) => Promise<boolean>;
  openTradePlans: OpenTradePlanOption[] | undefined;
  portfolios: PortfolioOption[] | undefined;
}

export function InboxTable({
  accountLabelByKey,
  campaigns,
  editingTradeId,
  inlineNotes,
  inlinePortfolioIds,
  inlineTradePlanIds,
  inboxTrades,
  onAccept,
  onDelete,
  onEdit,
  onInlineNotesBlur,
  onInlineNotesChange,
  onInlinePortfolioChange,
  onInlineTradePlanChange,
  onQuickCreateTradePlan,
  openTradePlans,
  portfolios,
}: InboxTableProps) {
  const [quickCreateTradeId, setQuickCreateTradeId] =
    useState<Id<"inboxTrades"> | null>(null);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [quickCreateInstrument, setQuickCreateInstrument] = useState("");
  const [quickCreateCampaignId, setQuickCreateCampaignId] = useState("");
  const [quickCreateLoadingByTradeId, setQuickCreateLoadingByTradeId] = useState<
    Record<string, boolean>
  >({});

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
              Portfolio
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
                    <Badge variant={trade.side === "buy" ? "success" : "danger"}>
                      {trade.side.toUpperCase()}
                    </Badge>
                  ) : (
                    <span className="text-slate-11">---</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {trade.direction ? (
                    <Badge variant={trade.direction === "long" ? "info" : "danger"}>
                      {trade.direction.toUpperCase()}
                    </Badge>
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
                  <div className="flex items-center gap-1">
                    <select
                      value={inlineTradePlanIds[trade._id] ?? ""}
                      onChange={(e) =>
                        onInlineTradePlanChange(trade._id, e.target.value)
                      }
                      className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                    >
                      <option value="">None</option>
                      {(() => {
                        const ticker = trade.ticker?.toUpperCase();
                        const matching =
                          openTradePlans?.filter(
                            (p) =>
                              p.instrumentSymbol.toUpperCase() === ticker,
                          ) ?? [];
                        const rest =
                          openTradePlans?.filter(
                            (p) =>
                              p.instrumentSymbol.toUpperCase() !== ticker,
                          ) ?? [];
                        return (
                          <>
                            {matching.length > 0 && (
                              <optgroup label="Matching plans">
                                {matching.map((plan) => (
                                  <option key={plan._id} value={plan._id}>
                                    {plan.name} ({plan.instrumentSymbol})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {rest.length > 0 && (
                              <optgroup
                                label={
                                  matching.length > 0
                                    ? "Other plans"
                                    : "Trade plans"
                                }
                              >
                                {rest.map((plan) => (
                                  <option key={plan._id} value={plan._id}>
                                    {plan.name} ({plan.instrumentSymbol})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                    </select>
                    <button
                      type="button"
                      aria-label="Quick create trade plan"
                      title="Quick create trade plan"
                      onClick={() => {
                        if (quickCreateTradeId === trade._id) {
                          setQuickCreateTradeId(null);
                        } else {
                          setQuickCreateTradeId(trade._id);
                          setQuickCreateName("");
                          setQuickCreateInstrument(trade.ticker ?? "");
                          setQuickCreateCampaignId("");
                        }
                      }}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {quickCreateTradeId === trade._id && (
                    <div className="mt-1 flex flex-col gap-1">
                      <input
                        type="text"
                        value={quickCreateName}
                        onChange={(e) => setQuickCreateName(e.target.value)}
                        placeholder="Plan name"
                        className="text-slate-12 h-7 w-full rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                      />
                      <input
                        type="text"
                        value={quickCreateInstrument}
                        onChange={(e) =>
                          setQuickCreateInstrument(e.target.value)
                        }
                        placeholder="Symbol"
                        className="text-slate-12 h-7 w-full rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                      />
                      <select
                        value={quickCreateCampaignId}
                        onChange={(e) =>
                          setQuickCreateCampaignId(e.target.value)
                        }
                        className="text-slate-12 h-7 w-full rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                      >
                        <option value="">No campaign</option>
                        {campaigns?.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !quickCreateName.trim() ||
                              !quickCreateInstrument.trim()
                            )
                              return;
                            if (quickCreateLoadingByTradeId[trade._id]) return;

                            setQuickCreateLoadingByTradeId((prev) => ({
                              ...prev,
                              [trade._id]: true,
                            }));
                            try {
                              const created = await onQuickCreateTradePlan(trade._id, {
                                name: quickCreateName.trim(),
                                instrumentSymbol: quickCreateInstrument.trim(),
                                campaignId: quickCreateCampaignId
                                  ? (quickCreateCampaignId as Id<"campaigns">)
                                  : undefined,
                              });
                              if (created) {
                                setQuickCreateTradeId(null);
                              }
                            } finally {
                              setQuickCreateLoadingByTradeId((prev) => ({
                                ...prev,
                                [trade._id]: false,
                              }));
                            }
                          }}
                          className="h-7 rounded bg-green-700 px-2 text-xs text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={Boolean(quickCreateLoadingByTradeId[trade._id])}
                        >
                          {quickCreateLoadingByTradeId[trade._id]
                            ? "Creating..."
                            : "Create"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickCreateTradeId(null)}
                          className="h-7 rounded bg-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <select
                    aria-label={`Portfolio for ${trade.ticker || "trade"}`}
                    value={inlinePortfolioIds[trade._id] ?? ""}
                    onChange={(e) =>
                      onInlinePortfolioChange(trade._id, e.target.value)
                    }
                    className="text-slate-12 h-7 w-full min-w-[120px] rounded border border-slate-600 bg-slate-700 px-1 text-xs"
                  >
                    <option value="">None</option>
                    {portfolios?.map((portfolio) => (
                      <option key={portfolio._id} value={portfolio._id}>
                        {portfolio.name}
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
