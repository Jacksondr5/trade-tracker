import { useAction } from "convex/react";
import { AlertTriangle, Check, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
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
import { filterLegacyStatementWarnings } from "~/lib/imports/display-validation-warnings";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../../shared/imports/constants";
import type { InboxTrade, InboxTradePriceMapping } from "../types";
import {
  formatCurrency,
  formatDate,
  isTradeReadyForAcceptance,
} from "../utils";
import { EditTradeForm, type EditTradeFormValues } from "./edit-trade-form";

interface PortfolioOption {
  _id: Id<"portfolios">;
  name: string;
}

interface InboxTableProps {
  accountLabelByKey: Map<string, string>;
  editingTradeId: Id<"inboxTrades"> | null;
  editInitialValues: EditTradeFormValues;
  inlinePortfolioIds: Record<string, string>;
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
  onSaveEdit: (values: EditTradeFormValues) => Promise<void>;
  portfolios: PortfolioOption[] | undefined;
}

const TOTAL_COLUMNS = 11;
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

type RowStatus = "ready" | "needs-review";

function isPriceMappingResolved(
  mapping: InboxTradePriceMapping | undefined,
): boolean {
  return mapping?.state === "resolved" || mapping?.state === "ignored";
}

function getRowStatus(
  trade: InboxTrade,
  hasPortfolio: boolean,
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
  const setProviderSymbol = useAction(api.marketData.setProviderSymbol);
  const [open, setOpen] = useState(false);
  const initialSymbol =
    priceMapping.state === "resolved" ? priceMapping.providerSymbol : ticker;
  const [providerSymbol, setProviderSymbolValue] = useState(initialSymbol);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastError =
    priceMapping.state === "needs_review" ? priceMapping.lastError : undefined;
  const showInstrumentControls =
    priceMapping.state === "needs_review" || priceMapping.state === "resolved";

  useEffect(() => {
    if (!open) return;
    setProviderSymbolValue(initialSymbol);
    setError(null);
  }, [initialSymbol, open]);

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
            We couldn&apos;t auto-resolve{" "}
            <span className="font-mono">{ticker}</span> against Twelve Data. Set
            the provider symbol manually to unblock acceptance.
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
                className="h-7 w-full rounded-md border border-slate-6 bg-slate-3 px-2 text-xs text-slate-12 focus:ring-1 focus:ring-blue-8 focus:outline-none"
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

export function InboxTable({
  accountLabelByKey,
  editingTradeId,
  editInitialValues,
  inlinePortfolioIds,
  inboxTrades,
  priceMappingByInboxTradeId,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
  onInlinePortfolioChange,
  onSaveEdit,
  portfolios,
}: InboxTableProps) {
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
                editInitialValues={editInitialValues}
                inlinePortfolioId={inlinePortfolioIds[trade._id] ?? ""}
                isEditing={isEditing}
                priceMapping={priceMappingByInboxTradeId.get(trade._id)}
                onAccept={() => onAccept(trade._id)}
                onCancelEdit={onCancelEdit}
                onDelete={() => onDelete(trade._id)}
                onEdit={() => onEdit(trade)}
                onInlinePortfolioChange={(v) =>
                  onInlinePortfolioChange(trade._id, v)
                }
                onSaveEdit={onSaveEdit}
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
  editInitialValues,
  inlinePortfolioId,
  isEditing,
  onAccept,
  onCancelEdit,
  onDelete,
  onEdit,
  onInlinePortfolioChange,
  onSaveEdit,
  portfolios,
  priceMapping,
  trade,
}: {
  accountFriendlyName: string | null;
  editInitialValues: EditTradeFormValues;
  inlinePortfolioId: string;
  isEditing: boolean;
  onAccept: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onInlinePortfolioChange: (value: string) => void;
  onSaveEdit: (values: EditTradeFormValues) => Promise<void>;
  portfolios: Array<{ _id: Id<"portfolios">; name: string }> | undefined;
  priceMapping: InboxTradePriceMapping | undefined;
  trade: InboxTrade;
}) {
  const hasPortfolio = inlinePortfolioId !== "";
  const acceptable = canAcceptTrade(trade, hasPortfolio, priceMapping);
  const rowStatus = getRowStatus(trade, hasPortfolio, priceMapping);
  const priceMappingBlocking = !isPriceMappingResolved(priceMapping);
  const displayWarnings = filterLegacyStatementWarnings(
    trade.validationWarnings,
  );

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
        <td className="px-4 py-2 text-sm whitespace-nowrap text-slate-12">
          {trade.date !== undefined ? formatDate(trade.date) : "---"}
        </td>
        {/* Ticker + validation */}
        <td className="px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-12">
          {trade.ticker ?? "---"}
          {priceMappingBlocking &&
          priceMapping !== undefined &&
          trade.ticker ? (
            <div className="mt-1">
              <PriceMappingPopover
                inboxTradeId={trade._id}
                priceMapping={priceMapping}
                ticker={trade.ticker}
              />
            </div>
          ) : null}
          {(trade.validationErrors.length > 0 ||
            displayWarnings.length > 0) && (
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
              {displayWarnings
                .slice(0, MAX_VALIDATION_BADGES)
                .map((warning, index) => (
                  <div key={`${trade._id}-warning-${index}`}>
                    <Badge variant="warning" className="text-[10px]">
                      {warning}
                    </Badge>
                  </div>
                ))}
              <ValidationOverflowIndicator
                messages={displayWarnings}
                tradeId={trade._id}
                type="warning"
              />
            </div>
          )}
        </td>
        {/* Side */}
        <td className="px-4 py-2 text-sm whitespace-nowrap">
          {trade.side ? (
            <Badge variant={trade.side === "buy" ? "success" : "danger"}>
              {trade.side.toUpperCase()}
            </Badge>
          ) : (
            <span className="text-slate-11">---</span>
          )}
        </td>
        {/* Direction */}
        <td className="px-4 py-2 text-sm whitespace-nowrap">
          {trade.direction ? (
            <Badge variant={trade.direction === "long" ? "info" : "warning"}>
              {trade.direction.toUpperCase()}
            </Badge>
          ) : (
            <span className="text-slate-11">---</span>
          )}
        </td>
        {/* Price */}
        <td className="px-4 py-2 text-right text-sm whitespace-nowrap text-slate-12">
          {trade.price !== undefined ? formatCurrency(trade.price) : "---"}
        </td>
        {/* Qty */}
        <td className="px-4 py-2 text-right text-sm whitespace-nowrap text-slate-12">
          {trade.quantity !== undefined ? trade.quantity.toFixed(1) : "---"}
        </td>
        {/* Value */}
        <td className="px-4 py-2 text-right text-sm whitespace-nowrap text-slate-12">
          {trade.price !== undefined && trade.quantity !== undefined
            ? formatCurrency(trade.price * trade.quantity)
            : "---"}
        </td>
        {/* Account */}
        <td className="px-4 py-2 text-sm whitespace-nowrap text-slate-11">
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
        <td className="px-4 py-2 text-right text-sm whitespace-nowrap">
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
