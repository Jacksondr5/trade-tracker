import { Check, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, ConfirmDeleteButton } from "~/components/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import type { Id } from "~/convex/_generated/dataModel";
import { cn } from "~/lib/utils";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../../shared/imports/constants";
import type { InboxTrade, OpenTradePlanOption } from "../types";
import {
  formatCurrency,
  formatDate,
  isTradeReadyForAcceptance,
} from "../utils";
import {
  EditTradeForm,
  type EditTradeFormValues,
} from "./edit-trade-form";

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
  editInitialValues: EditTradeFormValues;
  inlineNotes: Record<string, string>;
  inlinePortfolioIds: Record<string, string>;
  inlineTradePlanIds: Record<string, string>;
  inboxTrades: InboxTrade[] | undefined;
  onAccept: (inboxTradeId: Id<"inboxTrades">) => void;
  onCancelEdit: () => void;
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
  onSaveEdit: (values: EditTradeFormValues) => Promise<void>;
  openTradePlans: OpenTradePlanOption[] | undefined;
  portfolios: PortfolioOption[] | undefined;
}

const TOTAL_COLUMNS = 13;

function SkeletonRow() {
  return (
    <tr>
      <td className="px-2 py-3">
        <div className="mx-auto h-2 w-2 animate-pulse rounded-full bg-slate-4" />
      </td>
      {Array.from({ length: TOTAL_COLUMNS - 1 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-slate-4" />
        </td>
      ))}
    </tr>
  );
}

function RowStatusDot({
  trade,
  testId,
}: {
  trade: InboxTrade;
  testId: string;
}) {
  const hasErrors = trade.validationErrors.length > 0;
  const isReady = isTradeReadyForAcceptance(trade);

  let color: string;
  let label: string;
  if (hasErrors) {
    color = "bg-red-9";
    label = "Has validation errors";
  } else if (isReady) {
    color = "bg-grass-9";
    label = "Ready to accept";
  } else {
    color = "bg-amber-9";
    label = "Needs review";
  }

  return (
    <td className="px-2 py-3">
      <span
        className={`inline-block h-2 w-2 rounded-full ${color}`}
        data-testid={testId}
        title={label}
        aria-label={label}
      />
    </td>
  );
}

function QuickCreatePopover({
  campaigns,
  defaultSymbol,
  isLoading,
  onCancel,
  onCreate,
}: {
  campaigns:
    | Array<{ _id: Id<"campaigns">; name: string; status: string }>
    | undefined;
  defaultSymbol: string;
  isLoading: boolean;
  onCancel: () => void;
  onCreate: (args: {
    name: string;
    instrumentSymbol: string;
    campaignId?: Id<"campaigns">;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [instrument, setInstrument] = useState(defaultSymbol);
  const [campaignId, setCampaignId] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-olive-12">New trade plan</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="AAPL breakout setup"
        className="h-7 w-full rounded-md border border-slate-6 bg-slate-3 px-2 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
        data-testid="quick-create-name-input"
      />
      <input
        type="text"
        value={instrument}
        onChange={(e) => setInstrument(e.target.value)}
        placeholder="Symbol"
        className="h-7 w-full rounded-md border border-slate-6 bg-slate-3 px-2 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
        data-testid="quick-create-symbol-input"
      />
      <select
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
        className="h-7 w-full rounded-md border border-slate-6 bg-slate-3 px-1 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
        data-testid="quick-create-campaign-select"
      >
        <option value="">No campaign</option>
        {campaigns?.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <Button
          dataTestId="quick-create-submit"
          size="sm"
          disabled={!name.trim() || !instrument.trim() || isLoading}
          isLoading={isLoading}
          onClick={() =>
            onCreate({
              name: name.trim(),
              instrumentSymbol: instrument.trim(),
              campaignId: campaignId
                ? (campaignId as Id<"campaigns">)
                : undefined,
            })
          }
        >
          Create trade plan
        </Button>
        <Button
          dataTestId="quick-create-cancel"
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function InboxTable({
  accountLabelByKey,
  campaigns,
  editingTradeId,
  editInitialValues,
  inlineNotes,
  inlinePortfolioIds,
  inlineTradePlanIds,
  inboxTrades,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
  onInlineNotesBlur,
  onInlineNotesChange,
  onInlinePortfolioChange,
  onInlineTradePlanChange,
  onQuickCreateTradePlan,
  onSaveEdit,
  openTradePlans,
  portfolios,
}: InboxTableProps) {
  const [quickCreateOpenForTradeId, setQuickCreateOpenForTradeId] =
    useState<Id<"inboxTrades"> | null>(null);
  const [quickCreateLoadingByTradeId, setQuickCreateLoadingByTradeId] =
    useState<Record<string, boolean>>({});

  if (inboxTrades === undefined) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-6">
        <table className="w-full table-auto">
          <thead className="bg-slate-3">
            <tr>
              <th className="w-8 px-2 py-2" />
              {[
                "Date",
                "Ticker",
                "Side",
                "Direction",
                "Price",
                "Qty",
                "Value",
                "Account",
                "Trade Plan",
                "Portfolio",
                "Notes",
                "Actions",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-2 text-left text-xs font-medium text-slate-11"
                >
                  <div className="h-4 w-12 animate-pulse rounded bg-slate-4" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-6 bg-slate-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </tbody>
        </table>
      </div>
    );
  }

  if (inboxTrades.length === 0) {
    return (
      <div className="rounded-lg border border-olive-6 bg-olive-2 p-6">
        <p className="text-sm font-medium text-olive-12">
          No trades waiting for review
        </p>
        <p className="mt-1 text-sm text-olive-11">
          Imported trades will appear here before they become permanent trade
          records.
        </p>
      </div>
    );
  }

  const handleQuickCreate = async (
    tradeId: Id<"inboxTrades">,
    args: {
      name: string;
      instrumentSymbol: string;
      campaignId?: Id<"campaigns">;
    },
  ) => {
    setQuickCreateLoadingByTradeId((prev) => ({
      ...prev,
      [tradeId]: true,
    }));
    try {
      const created = await onQuickCreateTradePlan(tradeId, args);
      if (created) {
        setQuickCreateOpenForTradeId(null);
      }
    } finally {
      setQuickCreateLoadingByTradeId((prev) => ({
        ...prev,
        [tradeId]: false,
      }));
    }
  };

  return (
    <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-6">
      <table className="w-full table-auto">
        <thead className="bg-slate-3">
          <tr>
            <th className="w-8 px-2 py-2" />
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Date
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Ticker
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Side
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Direction
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-11">
              Price
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-11">
              Qty
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-11">
              Value
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Account
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Trade Plan
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Portfolio
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-11">
              Notes
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-11">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-6 bg-slate-2">
          {inboxTrades.map((trade) => {
            const accountFriendlyName = trade.brokerageAccountId
              ? accountLabelByKey.get(
                  `${trade.source}|${trade.brokerageAccountId}`,
                )
              : null;

            const isEditing = editingTradeId === trade._id;

            return (
              <InboxRow
                key={trade._id}
                accountFriendlyName={accountFriendlyName ?? null}
                campaigns={campaigns}
                editInitialValues={editInitialValues}
                inlineNotes={inlineNotes[trade._id] ?? ""}
                inlinePortfolioId={inlinePortfolioIds[trade._id] ?? ""}
                inlineTradePlanId={inlineTradePlanIds[trade._id] ?? ""}
                isEditing={isEditing}
                isQuickCreateLoading={Boolean(
                  quickCreateLoadingByTradeId[trade._id],
                )}
                isQuickCreateOpen={quickCreateOpenForTradeId === trade._id}
                onAccept={() => onAccept(trade._id)}
                onCancelEdit={onCancelEdit}
                onDelete={() => onDelete(trade._id)}
                onEdit={() => onEdit(trade)}
                onInlineNotesBlur={(v) => onInlineNotesBlur(trade._id, v)}
                onInlineNotesChange={(v) =>
                  onInlineNotesChange(trade._id, v)
                }
                onInlinePortfolioChange={(v) =>
                  onInlinePortfolioChange(trade._id, v)
                }
                onInlineTradePlanChange={(v) =>
                  onInlineTradePlanChange(trade._id, v)
                }
                onQuickCreate={(args) =>
                  void handleQuickCreate(trade._id, args)
                }
                onQuickCreateCancel={() =>
                  setQuickCreateOpenForTradeId(null)
                }
                onQuickCreateToggle={() =>
                  setQuickCreateOpenForTradeId(
                    quickCreateOpenForTradeId === trade._id
                      ? null
                      : trade._id,
                  )
                }
                onSaveEdit={onSaveEdit}
                openTradePlans={openTradePlans}
                portfolios={portfolios}
                trade={trade}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InboxRow({
  accountFriendlyName,
  campaigns,
  editInitialValues,
  inlineNotes,
  inlinePortfolioId,
  inlineTradePlanId,
  isEditing,
  isQuickCreateLoading,
  isQuickCreateOpen,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
  onInlineNotesBlur,
  onInlineNotesChange,
  onInlinePortfolioChange,
  onInlineTradePlanChange,
  onQuickCreate,
  onQuickCreateCancel,
  onQuickCreateToggle,
  onSaveEdit,
  openTradePlans,
  portfolios,
  trade,
}: {
  accountFriendlyName: string | null;
  campaigns:
    | Array<{ _id: Id<"campaigns">; name: string; status: string }>
    | undefined;
  editInitialValues: EditTradeFormValues;
  inlineNotes: string;
  inlinePortfolioId: string;
  inlineTradePlanId: string;
  isEditing: boolean;
  isQuickCreateLoading: boolean;
  isQuickCreateOpen: boolean;
  onAccept: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onInlineNotesBlur: (value: string) => void;
  onInlineNotesChange: (value: string) => void;
  onInlinePortfolioChange: (value: string) => void;
  onInlineTradePlanChange: (value: string) => void;
  onQuickCreate: (args: {
    name: string;
    instrumentSymbol: string;
    campaignId?: Id<"campaigns">;
  }) => void;
  onQuickCreateCancel: () => void;
  onQuickCreateToggle: () => void;
  onSaveEdit: (values: EditTradeFormValues) => Promise<void>;
  openTradePlans: OpenTradePlanOption[] | undefined;
  portfolios:
    | Array<{ _id: Id<"portfolios">; name: string }>
    | undefined;
  trade: InboxTrade;
}) {
  const ready = isTradeReadyForAcceptance(trade);
  const ticker = trade.ticker?.toUpperCase();
  const matchingPlans =
    openTradePlans?.filter(
      (p) => p.instrumentSymbol.toUpperCase() === ticker,
    ) ?? [];
  const otherPlans =
    openTradePlans?.filter(
      (p) => p.instrumentSymbol.toUpperCase() !== ticker,
    ) ?? [];

  return (
    <>
      <tr
        className={cn("hover:bg-slate-3", {
          "bg-amber-3/30 ring-1 ring-inset ring-amber-7": isEditing,
        })}
        data-testid={`inbox-row-${trade._id}`}
      >
        <RowStatusDot
          trade={trade}
          testId={`inbox-row-status-${trade._id}`}
        />
        {/* Date */}
        <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-12">
          {trade.date !== undefined ? formatDate(trade.date) : "---"}
        </td>
        {/* Ticker + validation */}
        <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-slate-12">
          {trade.ticker ?? "---"}
          {(trade.validationErrors.length > 0 ||
            trade.validationWarnings.length > 0) && (
            <div className="mt-1 space-y-0.5">
              {trade.validationErrors.slice(0, 2).map((error, index) => (
                <div key={`${trade._id}-error-${index}`}>
                  <Badge variant="danger" className="text-[10px]">
                    {error}
                  </Badge>
                </div>
              ))}
              {trade.validationWarnings.slice(0, 2).map((warning, index) => (
                <div key={`${trade._id}-warning-${index}`}>
                  <Badge variant="warning" className="text-[10px]">
                    {warning}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </td>
        {/* Side */}
        <td className="whitespace-nowrap px-4 py-2 text-sm">
          {trade.side ? (
            <Badge variant={trade.side === "buy" ? "success" : "danger"}>
              {trade.side.toUpperCase()}
            </Badge>
          ) : (
            <span className="text-slate-11">---</span>
          )}
        </td>
        {/* Direction */}
        <td className="whitespace-nowrap px-4 py-2 text-sm">
          {trade.direction ? (
            <Badge
              variant={trade.direction === "long" ? "success" : "danger"}
            >
              {trade.direction.toUpperCase()}
            </Badge>
          ) : (
            <span className="text-slate-11">---</span>
          )}
        </td>
        {/* Price */}
        <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-12">
          {trade.price !== undefined ? formatCurrency(trade.price) : "---"}
        </td>
        {/* Qty */}
        <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-12">
          {trade.quantity ?? "---"}
        </td>
        {/* Value */}
        <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-12">
          {trade.price !== undefined && trade.quantity !== undefined
            ? formatCurrency(trade.price * trade.quantity)
            : "---"}
        </td>
        {/* Account */}
        <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-11">
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
        {/* Trade Plan */}
        <td className="px-4 py-2 text-sm">
          <div className="flex items-center gap-1">
            <select
              value={inlineTradePlanId}
              onChange={(e) => onInlineTradePlanChange(e.target.value)}
              className="h-7 w-full min-w-[120px] rounded-md border border-slate-6 bg-slate-3 px-1 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
            >
              <option value="">None</option>
              {matchingPlans.length > 0 && (
                <optgroup label="Matching plans">
                  {matchingPlans.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} ({plan.instrumentSymbol})
                    </option>
                  ))}
                </optgroup>
              )}
              {otherPlans.length > 0 && (
                <optgroup
                  label={
                    matchingPlans.length > 0 ? "Other plans" : "Trade plans"
                  }
                >
                  {otherPlans.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} ({plan.instrumentSymbol})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Popover
              open={isQuickCreateOpen}
              onOpenChange={(open) => {
                if (!open) onQuickCreateCancel();
                else onQuickCreateToggle();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Quick create trade plan"
                  title="New trade plan"
                  className="shrink-0 rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
                  data-testid={`quick-create-trigger-${trade._id}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="right"
                className="w-64"
                data-testid={`quick-create-popover-${trade._id}`}
              >
                <QuickCreatePopover
                  campaigns={campaigns}
                  defaultSymbol={trade.ticker ?? ""}
                  isLoading={isQuickCreateLoading}
                  onCancel={onQuickCreateCancel}
                  onCreate={onQuickCreate}
                />
              </PopoverContent>
            </Popover>
          </div>
        </td>
        {/* Portfolio */}
        <td className="px-4 py-2 text-sm">
          <select
            aria-label={`Portfolio for ${trade.ticker || "trade"}`}
            value={inlinePortfolioId}
            onChange={(e) => onInlinePortfolioChange(e.target.value)}
            className="h-7 w-full min-w-[120px] rounded-md border border-slate-6 bg-slate-3 px-1 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
          >
            <option value="">None</option>
            {portfolios?.map((portfolio) => (
              <option key={portfolio._id} value={portfolio._id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </td>
        {/* Notes */}
        <td className="px-4 py-2 text-sm">
          <input
            type="text"
            value={inlineNotes}
            onChange={(e) => onInlineNotesChange(e.target.value)}
            onBlur={(e) => onInlineNotesBlur(e.target.value)}
            placeholder="Notes..."
            className="h-7 w-full min-w-[120px] rounded-md border border-slate-6 bg-slate-3 px-2 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
          />
        </td>
        {/* Actions */}
        <td className="whitespace-nowrap px-4 py-2 text-right text-sm">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="Accept trade"
              onClick={onAccept}
              disabled={!ready}
              className="rounded p-1 text-grass-9 hover:bg-grass-3 disabled:cursor-not-allowed disabled:opacity-40"
              title={ready ? "Accept trade" : "Missing required fields"}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Edit trade"
              onClick={onEdit}
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
              title="Edit trade"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <ConfirmDeleteButton
              dataTestId={`delete-inbox-trade-${trade._id}`}
              tooltipTestId={`delete-inbox-trade-tooltip-${trade._id}`}
              onConfirm={onDelete}
            />
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr>
          <td colSpan={TOTAL_COLUMNS} className="p-0">
            <EditTradeForm
              key={trade._id}
              initialValues={editInitialValues}
              onCancel={onCancelEdit}
              onSave={onSaveEdit}
            />
          </td>
        </tr>
      )}
    </>
  );
}
