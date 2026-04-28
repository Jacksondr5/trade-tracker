import { useMutation } from "convex/react";
import { AlertTriangle, Check, FileText, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  ConfirmDeleteButton,
  EmptyState,
  Select,
  Skeleton,
} from "~/components/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { IMPORTS_INDEX_TEST_IDS } from "../../../../../shared/e2e/testIds";
import { cn } from "~/lib/utils";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../../shared/imports/constants";
import { ImportPostDialog } from "../../trade-plans/ImportPostDialog";
import type {
  InboxTrade,
  InboxTradePriceMapping,
  OpenTradePlanOption,
} from "../types";
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
  inlinePortfolioIds: Record<string, string>;
  inlineTradePlanIds: Record<string, string>;
  inboxTrades: InboxTrade[] | undefined;
  priceMappingByInboxTradeId: Map<Id<"inboxTrades">, InboxTradePriceMapping>;
  onAccept: (inboxTradeId: Id<"inboxTrades">) => void;
  onCancelEdit: () => void;
  onDelete: (inboxTradeId: Id<"inboxTrades">) => void;
  onEdit: (trade: InboxTrade) => void;
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

const TOTAL_COLUMNS = 12;
const MAX_VALIDATION_BADGES = 2;

interface ValidationOverflowIndicatorProps {
  messages: string[];
  tradeId: Id<"inboxTrades">;
  type: "error" | "warning";
}

function ValidationOverflowIndicator({
  messages,
  tradeId,
  type,
}: ValidationOverflowIndicatorProps) {
  const remainingMessages = messages.slice(MAX_VALIDATION_BADGES);

  if (remainingMessages.length === 0) {
    return null;
  }

  const variant = type === "error" ? "danger" : "warning";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help border-0 bg-transparent p-0 text-left"
        >
          <Badge variant={variant} className="text-[10px]">
            +{remainingMessages.length} more
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-xs p-3">
        <div className="space-y-1">
          {remainingMessages.map((message, index) => (
            <Badge
              key={`${tradeId}-${type}-overflow-${index}`}
              variant={variant}
              className="mr-1 text-[10px]"
            >
              {message}
            </Badge>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <Skeleton
          surface="dense"
          height="xs"
          className="mx-auto w-2 rounded-full"
        />
      </td>
      {Array.from({ length: TOTAL_COLUMNS - 1 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton surface="dense" height="sm" className="w-full" />
        </td>
      ))}
    </tr>
  );
}

type RowStatus = "ready" | "missing-plan" | "needs-review";

function isPriceMappingResolved(
  mapping: InboxTradePriceMapping | undefined,
): boolean {
  return mapping?.state === "resolved" || mapping?.state === "ignored";
}

function getRowStatus(
  trade: InboxTrade,
  hasPortfolio: boolean,
  hasTradePlan: boolean,
  priceMapping: InboxTradePriceMapping | undefined,
): RowStatus {
  const hasErrors = trade.validationErrors.length > 0;
  const fieldsValid = isTradeReadyForAcceptance(trade);
  if (
    hasErrors ||
    !fieldsValid ||
    !hasPortfolio ||
    !isPriceMappingResolved(priceMapping)
  )
    return "needs-review";
  if (!hasTradePlan) return "missing-plan";
  return "ready";
}

function canAcceptTrade(
  trade: InboxTrade,
  hasPortfolio: boolean,
  priceMapping: InboxTradePriceMapping | undefined,
): boolean {
  return (
    trade.validationErrors.length === 0 &&
    isTradeReadyForAcceptance(trade) &&
    hasPortfolio &&
    isPriceMappingResolved(priceMapping)
  );
}

function RowStatusDot({
  status,
  testId,
}: {
  status: RowStatus;
  testId: string;
}) {
  const config = {
    ready: { color: "bg-grass-9", label: "Ready to accept" },
    "missing-plan": { color: "bg-amber-9", label: "Missing trade plan" },
    "needs-review": { color: "bg-red-9", label: "Needs review" },
  }[status];

  return (
    <td className="px-4 py-3">
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.color}`}
        data-testid={testId}
        title={config.label}
        aria-label={config.label}
      />
    </td>
  );
}

function PriceMappingPopover({
  inboxTradeId,
  priceMapping,
  ticker,
}: {
  inboxTradeId: Id<"inboxTrades">;
  priceMapping: InboxTradePriceMapping;
  ticker: string;
}) {
  const setProviderSymbol = useMutation(api.marketData.setProviderSymbol);
  const [open, setOpen] = useState(false);
  const initialSymbol =
    priceMapping.state === "resolved" ? priceMapping.providerSymbol : ticker;
  const [providerSymbol, setProviderSymbolValue] = useState(initialSymbol);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastError =
    priceMapping.state === "needs_review" ? priceMapping.lastError : undefined;
  const showInstrumentControls =
    priceMapping.state === "needs_review" ||
    priceMapping.state === "resolved";

  const handleSave = async () => {
    if (!showInstrumentControls) return;
    const trimmed = providerSymbol.trim();
    if (!trimmed) {
      setError("Provider symbol is required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await setProviderSymbol({
        instrumentId: priceMapping.instrumentId,
        providerSymbol: trimmed,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer border-0 bg-transparent p-0 text-left"
          data-testid={`price-mapping-trigger-${inboxTradeId}`}
        >
          <Badge
            variant="danger"
            className="flex items-center gap-1 text-[10px]"
          >
            <AlertTriangle className="h-3 w-3" />
            Price mapping required
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3"
        data-testid={`price-mapping-popover-${inboxTradeId}`}
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-olive-12">
            Price mapping required
          </p>
          <p className="text-[11px] text-olive-11">
            We couldn&apos;t auto-resolve <span className="font-mono">{ticker}</span>{" "}
            against Twelve Data. Set the provider symbol manually to unblock
            acceptance.
          </p>
          {lastError ? (
            <p className="text-[11px] text-red-11">{lastError}</p>
          ) : null}
          {showInstrumentControls ? (
            <>
              <input
                type="text"
                value={providerSymbol}
                onChange={(e) => setProviderSymbolValue(e.target.value)}
                placeholder="e.g. AAPL or AAPL.US"
                className="h-7 w-full rounded-md border border-slate-6 bg-slate-3 px-2 text-xs text-slate-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
                data-testid={`price-mapping-symbol-input-${inboxTradeId}`}
              />
              {error ? (
                <p className="text-[11px] text-red-11">{error}</p>
              ) : null}
              <div className="flex gap-1">
                <Button
                  dataTestId={`price-mapping-save-${inboxTradeId}`}
                  size="sm"
                  isLoading={isSaving}
                  disabled={isSaving || !providerSymbol.trim()}
                  onClick={() => void handleSave()}
                >
                  Save
                </Button>
                <Button
                  dataTestId={`price-mapping-cancel-${inboxTradeId}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-olive-11">
              The instrument record is missing. Save the trade with valid asset
              type and ticker to register it.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickCreatePopover({
  campaigns,
  defaultSymbol,
  isLoading,
  onCancel,
  onCreate,
  onImportFromPost,
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
  onImportFromPost: () => void;
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
      <Select
        dataTestId="quick-create-campaign-select"
        size="dense"
        surface="dense"
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
      >
        <option value="">No campaign</option>
        {campaigns?.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </Select>
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
      <div className="border-t border-olive-6 pt-2">
        <button
          type="button"
          data-testid="quick-create-import-from-post"
          onClick={onImportFromPost}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-olive-11 hover:bg-olive-4 hover:text-olive-12"
        >
          <FileText className="h-3.5 w-3.5" />
          Import from post
        </button>
      </div>
    </div>
  );
}

export function InboxTable({
  accountLabelByKey,
  campaigns,
  editingTradeId,
  editInitialValues,
  inlinePortfolioIds,
  inlineTradePlanIds,
  inboxTrades,
  priceMappingByInboxTradeId,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
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
  const [importDialogTradeId, setImportDialogTradeId] =
    useState<Id<"inboxTrades"> | null>(null);

  if (inboxTrades === undefined) {
    return (
      <div className="overflow-visible rounded-lg border border-slate-6">
        <table className="w-full table-auto">
          <thead className="bg-slate-3">
            <tr>
              <th className="w-8 px-4 py-2" />
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
                "Actions",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-2 text-left text-xs font-medium text-slate-11"
                >
                  <Skeleton surface="dense" height="sm" className="w-12" />
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
      <EmptyState
        dataTestId={IMPORTS_INDEX_TEST_IDS.emptyState}
        title="No trades waiting for review"
        description="Imported trades will appear here before they become permanent trade records."
      />
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
    <div className="overflow-visible rounded-lg border border-slate-6">
      <table className="w-full table-auto">
        <thead className="bg-slate-3">
          <tr>
            <th className="w-8 px-4 py-2" />
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
                inlinePortfolioId={inlinePortfolioIds[trade._id] ?? ""}
                inlineTradePlanId={inlineTradePlanIds[trade._id] ?? ""}
                isEditing={isEditing}
                priceMapping={priceMappingByInboxTradeId.get(trade._id)}
                isQuickCreateLoading={Boolean(
                  quickCreateLoadingByTradeId[trade._id],
                )}
                isQuickCreateOpen={quickCreateOpenForTradeId === trade._id}
                onAccept={() => onAccept(trade._id)}
                onCancelEdit={onCancelEdit}
                onDelete={() => onDelete(trade._id)}
                onEdit={() => onEdit(trade)}
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
                onImportFromPost={() => {
                  setQuickCreateOpenForTradeId(null);
                  setImportDialogTradeId(trade._id);
                }}
                onSaveEdit={onSaveEdit}
                openTradePlans={openTradePlans}
                portfolios={portfolios}
                trade={trade}
              />
            );
          })}
        </tbody>
      </table>
      <ImportPostDialog
        inboxTradeId={importDialogTradeId ?? undefined}
        mode="create"
        open={importDialogTradeId !== null}
        onOpenChange={(open) => {
          if (!open) setImportDialogTradeId(null);
        }}
      />
    </div>
  );
}

function InboxRow({
  accountFriendlyName,
  campaigns,
  editInitialValues,
  inlinePortfolioId,
  inlineTradePlanId,
  isEditing,
  isQuickCreateLoading,
  isQuickCreateOpen,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
  onImportFromPost,
  onInlinePortfolioChange,
  onInlineTradePlanChange,
  onQuickCreate,
  onQuickCreateCancel,
  onQuickCreateToggle,
  onSaveEdit,
  openTradePlans,
  portfolios,
  priceMapping,
  trade,
}: {
  accountFriendlyName: string | null;
  campaigns:
    | Array<{ _id: Id<"campaigns">; name: string; status: string }>
    | undefined;
  editInitialValues: EditTradeFormValues;
  inlinePortfolioId: string;
  inlineTradePlanId: string;
  isEditing: boolean;
  isQuickCreateLoading: boolean;
  isQuickCreateOpen: boolean;
  onAccept: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onImportFromPost: () => void;
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
  priceMapping: InboxTradePriceMapping | undefined;
  trade: InboxTrade;
}) {
  const hasPortfolio = inlinePortfolioId !== "";
  const hasTradePlan = inlineTradePlanId !== "";
  const acceptable = canAcceptTrade(trade, hasPortfolio, priceMapping);
  const rowStatus = getRowStatus(trade, hasPortfolio, hasTradePlan, priceMapping);
  const priceMappingBlocking = !isPriceMappingResolved(priceMapping);
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
        className={cn({
          "bg-amber-3/30 shadow-[inset_0_1px_0_0_var(--amber-7),inset_1px_0_0_0_var(--amber-7),inset_-1px_0_0_0_var(--amber-7)]":
            isEditing,
          "hover:bg-slate-3": !isEditing,
        })}
        data-testid={`inbox-row-${trade._id}`}
      >
        <RowStatusDot
          status={rowStatus}
          testId={`inbox-row-status-${trade._id}`}
        />
        {/* Date */}
        <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-12">
          {trade.date !== undefined ? formatDate(trade.date) : "---"}
        </td>
        {/* Ticker + validation */}
        <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-slate-12">
          {trade.ticker ?? "---"}
          {priceMappingBlocking && priceMapping !== undefined && trade.ticker ? (
            <div className="mt-1">
              <PriceMappingPopover
                inboxTradeId={trade._id}
                priceMapping={priceMapping}
                ticker={trade.ticker}
              />
            </div>
          ) : null}
          {(trade.validationErrors.length > 0 ||
            trade.validationWarnings.length > 0) && (
            <div className="mt-1 space-y-0.5">
              {trade.validationErrors
                .slice(0, MAX_VALIDATION_BADGES)
                .map((error, index) => (
                  <div key={`${trade._id}-error-${index}`}>
                    <Badge variant="danger" className="text-[10px]">
                      {error}
                    </Badge>
                  </div>
                ))}
              <ValidationOverflowIndicator
                messages={trade.validationErrors}
                tradeId={trade._id}
                type="error"
              />
              {trade.validationWarnings
                .slice(0, MAX_VALIDATION_BADGES)
                .map((warning, index) => (
                  <div key={`${trade._id}-warning-${index}`}>
                    <Badge variant="warning" className="text-[10px]">
                      {warning}
                    </Badge>
                  </div>
                ))}
              <ValidationOverflowIndicator
                messages={trade.validationWarnings}
                tradeId={trade._id}
                type="warning"
              />
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
              variant={trade.direction === "long" ? "info" : "warning"}
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
          {trade.quantity !== undefined ? trade.quantity.toFixed(1) : "---"}
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
            <Select
              dataTestId={`trade-plan-select-${trade._id}`}
              size="dense"
              surface="dense"
              className="min-w-[120px]"
              value={inlineTradePlanId}
              onChange={(e) => onInlineTradePlanChange(e.target.value)}
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
            </Select>
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
                  onImportFromPost={onImportFromPost}
                />
              </PopoverContent>
            </Popover>
          </div>
        </td>
        {/* Portfolio */}
        <td className="px-4 py-2 text-sm">
          <Select
            aria-label={`Portfolio for ${trade.ticker || "trade"}`}
            dataTestId={`portfolio-select-${trade._id}`}
            size="dense"
            surface="dense"
            className="min-w-[120px]"
            value={inlinePortfolioId}
            onChange={(e) => onInlinePortfolioChange(e.target.value)}
          >
            <option value="">None</option>
            {portfolios?.map((portfolio) => (
              <option key={portfolio._id} value={portfolio._id}>
                {portfolio.name}
              </option>
            ))}
          </Select>
        </td>
        {/* Actions */}
        <td className="whitespace-nowrap px-4 py-2 text-right text-sm">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="Accept trade"
              data-testid={`accept-trade-${trade._id}`}
              onClick={onAccept}
              disabled={!acceptable}
              className="rounded p-1 text-grass-9 hover:bg-grass-3 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                acceptable
                  ? "Accept trade"
                  : priceMappingBlocking
                    ? "Price mapping required"
                    : "Missing required fields or portfolio"
              }
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Edit trade"
              data-testid={`edit-trade-${trade._id}`}
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
        <tr className="bg-amber-3/30 shadow-[inset_0_-1px_0_0_var(--amber-7),inset_1px_0_0_0_var(--amber-7),inset_-1px_0_0_0_var(--amber-7)]">
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
