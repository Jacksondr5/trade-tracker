"use client";

import {
  Preloaded,
  useAction,
  useMutation,
  usePreloadedQuery,
} from "convex/react";
import { Download } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Select } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import { MANUAL_IMPORT_TEMPLATE_CSV } from "~/lib/imports/manual-parser";
import type { Id } from "~/convex/_generated/dataModel";
import {
  APP_PAGE_TITLES,
  IMPORTS_INDEX_TEST_IDS,
} from "../../../../shared/e2e/testIds";
import type { BrokerageSource } from "../../../../shared/imports/types";
import { type EditTradeFormValues } from "./components/edit-trade-form";
import { BrokerageSyncPanel } from "./components/brokerage-sync-panel";
import { InboxTable } from "./components/inbox-table";
import { InboxToolbar } from "./components/inbox-toolbar";
import { useImportUpload } from "./hooks/use-import-upload";
import { useInlineInboxEdits } from "./hooks/use-inline-inbox-edits";
import type { InboxTrade, InboxTradePriceMapping } from "./types";
import { isTradeReadyForAcceptance, toDateTimeLocalValue } from "./utils";

const DEFAULT_EDIT_VALUES: EditTradeFormValues = {
  assetType: "stock",
  date: "",
  direction: "long",
  price: "",
  quantity: "",
  side: "",
  ticker: "",
};

export default function ImportsPageClient({
  preloadedAccountMappings,
  preloadedBrokerageIngestionStatus,
  preloadedInboxTradePriceMappings,
  preloadedInboxTrades,
  preloadedPortfolios,
}: {
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedBrokerageIngestionStatus: Preloaded<
    typeof api.brokerageIngestion.getBrokerageIngestionStatus
  >;
  preloadedInboxTradePriceMappings: Preloaded<
    typeof api.imports.listInboxTradePriceMappings
  >;
  preloadedInboxTrades: Preloaded<typeof api.imports.listInboxTrades>;
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
}) {
  const [brokerage, setBrokerage] = useState<BrokerageSource>("ibkr");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [acceptAllMessage, setAcceptAllMessage] = useState<{
    text: string;
    variant: "success" | "warning";
  } | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [editingTradeId, setEditingTradeId] =
    useState<Id<"inboxTrades"> | null>(null);
  const [editInitialValues, setEditInitialValues] =
    useState<EditTradeFormValues>(DEFAULT_EDIT_VALUES);

  const inboxTrades = usePreloadedQuery(preloadedInboxTrades);
  const inboxTradePriceMappings = usePreloadedQuery(
    preloadedInboxTradePriceMappings,
  );
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const portfolios = usePreloadedQuery(preloadedPortfolios);

  const accountLabelByKey = useMemo(
    () =>
      new Map(
        accountMappings.map((mapping) => [
          `${mapping.source}|${mapping.accountId}`,
          mapping.friendlyName,
        ]),
      ),
    [accountMappings],
  );

  const importTradesMutation = useMutation(api.imports.importTrades);
  const acceptTrade = useAction(api.imports.acceptTrade);
  const acceptAllTrades = useAction(api.imports.acceptAllTrades);
  const deleteInboxTrade = useMutation(api.imports.deleteInboxTrade);
  const deleteAllInboxTrades = useMutation(api.imports.deleteAllInboxTrades);
  const updateInboxTrade = useMutation(api.imports.updateInboxTrade);

  const {
    fileInputRef,
    handleFileChange,
    handleImport,
    importResult,
    isImporting,
    selectedFile,
    setImportResult,
  } = useImportUpload({
    brokerage,
    importTrades: importTradesMutation,
    setErrorMessage,
  });

  const { inlinePortfolioIds, setInlinePortfolioIds } = useInlineInboxEdits(
    inboxTrades as InboxTrade[] | undefined,
  );

  // Compute summary counts
  const typedTrades = inboxTrades as InboxTrade[] | undefined;
  const totalCount = typedTrades?.length ?? 0;

  const priceMappingByInboxTradeId = useMemo(() => {
    const map = new Map<Id<"inboxTrades">, InboxTradePriceMapping>();
    for (const entry of inboxTradePriceMappings) {
      map.set(entry.inboxTradeId, entry.priceMapping as InboxTradePriceMapping);
    }
    return map;
  }, [inboxTradePriceMappings]);

  const isPriceMappingResolved = useCallback(
    (inboxTradeId: Id<"inboxTrades">): boolean => {
      const mapping = priceMappingByInboxTradeId.get(inboxTradeId);
      return mapping?.state === "resolved" || mapping?.state === "ignored";
    },
    [priceMappingByInboxTradeId],
  );

  // "Ready" = valid fields + portfolio + resolved mapping.
  const readyCount = useMemo(
    () =>
      typedTrades?.filter((t) => {
        const hasPortfolio = (inlinePortfolioIds[t._id] ?? "") !== "";
        return (
          t.validationErrors.length === 0 &&
          isTradeReadyForAcceptance(t) &&
          hasPortfolio &&
          isPriceMappingResolved(t._id)
        );
      }).length ?? 0,
    [typedTrades, inlinePortfolioIds, isPriceMappingResolved],
  );

  const needsReviewCount = totalCount - readyCount;
  const acceptableCount = readyCount;

  const onBrokerageChange = (value: BrokerageSource) => {
    setBrokerage(value);
    setImportResult(null);
  };

  const downloadManualTemplate = () => {
    const blob = new Blob([`${MANUAL_IMPORT_TEMPLATE_CSV}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trade-tracker-manual-import-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const persistPortfolioSelection = (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => {
    void updateInboxTrade({
      inboxTradeId,
      portfolioId: value ? (value as Id<"portfolios">) : null,
    }).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update portfolio",
      );
    });
  };

  const handleEdit = (trade: InboxTrade) => {
    setEditingTradeId(trade._id);
    setEditInitialValues({
      assetType: trade.assetType ?? "stock",
      date: toDateTimeLocalValue(trade.date),
      direction: trade.direction ?? "long",
      price: trade.price !== undefined ? String(trade.price) : "",
      quantity: trade.quantity !== undefined ? String(trade.quantity) : "",
      side: trade.side ?? "",
      ticker: trade.ticker ?? "",
    });
  };

  const handleCancelEdit = () => {
    setEditingTradeId(null);
    setEditInitialValues(DEFAULT_EDIT_VALUES);
  };

  const handleSaveEdit = async (values: EditTradeFormValues) => {
    if (!editingTradeId) return;

    if (values.price.trim() && !Number.isFinite(Number(values.price))) {
      setErrorMessage("Price must be a valid number");
      return;
    }
    if (values.quantity.trim() && !Number.isFinite(Number(values.quantity))) {
      setErrorMessage("Quantity must be a valid number");
      return;
    }

    try {
      await updateInboxTrade({
        assetType: values.assetType,
        date: values.date ? new Date(values.date).getTime() : null,
        direction: values.direction,
        inboxTradeId: editingTradeId,
        price: values.price.trim() ? Number(values.price) : null,
        quantity: values.quantity.trim() ? Number(values.quantity) : null,
        side: values.side || null,
        ticker: values.ticker.trim() || null,
      });

      setEditingTradeId(null);
      setEditInitialValues(DEFAULT_EDIT_VALUES);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save edit",
      );
    }
  };

  const handleAccept = (inboxTradeId: Id<"inboxTrades">) => {
    const trade = inboxTrades?.find((t) => t._id === inboxTradeId);
    const portfolioId = inlinePortfolioIds[inboxTradeId] || undefined;
    if (
      !trade ||
      !isTradeReadyForAcceptance(trade) ||
      !portfolioId ||
      !isPriceMappingResolved(inboxTradeId)
    )
      return;

    void acceptTrade({
      inboxTradeId,
      portfolioId: portfolioId ? (portfolioId as Id<"portfolios">) : undefined,
    })
      .then((result) => {
        if (!result.accepted && result.error) {
          setErrorMessage(result.error);
        }
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to accept trade",
        );
      });
  };

  const handleAcceptAll = async () => {
    setIsAcceptingAll(true);
    setAcceptAllMessage(null);
    try {
      if (inboxTrades) {
        await Promise.all(
          inboxTrades.map((trade) => {
            const portfolio = inlinePortfolioIds[trade._id] ?? "";
            const portfolioChanged =
              portfolio !==
              (trade.portfolioId ? String(trade.portfolioId) : "");
            if (!portfolioChanged) return Promise.resolve();

            return updateInboxTrade({
              inboxTradeId: trade._id,
              portfolioId: portfolio ? (portfolio as Id<"portfolios">) : null,
            });
          }),
        );
      }

      const result = await acceptAllTrades();

      if (result.skippedInvalid > 0) {
        setAcceptAllMessage({
          text: `${result.accepted} ${result.accepted === 1 ? "trade" : "trades"} accepted. ${result.skippedInvalid} need review.`,
          variant: "warning",
        });
      } else if (result.accepted > 0) {
        setAcceptAllMessage({
          text: `${result.accepted} ${result.accepted === 1 ? "trade" : "trades"} accepted.`,
          variant: "success",
        });
      }

      if (result.errors.length > 0) {
        setErrorMessage(result.errors.slice(0, 3).join("; "));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Accept all failed",
      );
    } finally {
      setIsAcceptingAll(false);
    }
  };

  const handleDeleteAll = () => {
    if (isDeletingAll) return;

    setIsDeletingAll(true);
    void deleteAllInboxTrades()
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to delete all trades",
        );
      })
      .finally(() => {
        setIsDeletingAll(false);
      });
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Title row with inline upload controls */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1
          className="text-3xl font-bold text-olive-12"
          data-testid={APP_PAGE_TITLES.imports}
        >
          Imports
        </h1>
        <div className="ml-auto flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <label
            htmlFor="csv-file-input"
            className="flex h-9 cursor-pointer items-center rounded-md border border-olive-6 bg-olive-3 px-3 text-sm whitespace-nowrap text-olive-12 hover:bg-olive-4"
          >
            {selectedFile ? selectedFile.name : "Choose file"}
            <input
              ref={fileInputRef}
              id="csv-file-input"
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          <label htmlFor="brokerage-select" className="sr-only">
            Select brokerage
          </label>
          <Select
            dataTestId={IMPORTS_INDEX_TEST_IDS.brokerageSelect}
            id="brokerage-select"
            className="min-w-[210px] flex-1 lg:w-[230px] lg:flex-none"
            value={brokerage}
            onChange={(e) =>
              onBrokerageChange(e.target.value as BrokerageSource)
            }
          >
            <option value="ibkr">Interactive Brokers (IBKR)</option>
            <option value="kraken">Kraken</option>
            <option value="manual">Manual CSV</option>
          </Select>
          {brokerage === "manual" && (
            <Button
              dataTestId={IMPORTS_INDEX_TEST_IDS.templateDownloadButton}
              variant="outline"
              className="h-9"
              onClick={downloadManualTemplate}
            >
              <Download className="size-4" aria-hidden="true" />
              Download template
            </Button>
          )}
          <Button
            dataTestId="import-trades-button"
            className="h-9"
            disabled={!selectedFile}
            isLoading={isImporting}
            onClick={() => void handleImport()}
          >
            Import trades
          </Button>
        </div>
      </div>

      <BrokerageSyncPanel preloadedStatus={preloadedBrokerageIngestionStatus} />

      {/* Alerts */}
      <div className="mb-4 space-y-2">
        {importResult && (
          <Alert variant="success" onDismiss={() => setImportResult(null)}>
            Imported{" "}
            <span className="font-semibold">{importResult.imported}</span>{" "}
            {importResult.imported !== 1 ? "trades" : "trade"}.
            {importResult.skippedDuplicates > 0 && (
              <>
                {" "}
                Skipped{" "}
                <span className="font-semibold">
                  {importResult.skippedDuplicates}
                </span>{" "}
                {importResult.skippedDuplicates !== 1
                  ? "duplicates"
                  : "duplicate"}
                .
                {importResult.skippedLogicalDuplicates > 0 && (
                  <>
                    {" "}
                    <span className="font-semibold">
                      {importResult.skippedLogicalDuplicates}
                    </span>{" "}
                    matched an existing IBKR fill across identifier formats and
                    was recorded in the import logs.
                  </>
                )}
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
                <span className="font-semibold">
                  {importResult.withWarnings}
                </span>{" "}
                with warnings.
              </>
            )}
          </Alert>
        )}

        {acceptAllMessage && (
          <Alert
            variant={acceptAllMessage.variant}
            onDismiss={() => setAcceptAllMessage(null)}
          >
            {acceptAllMessage.text}
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="error" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}
      </div>

      {/* Summary strip + bulk actions + table */}
      <div className="space-y-3">
        <InboxToolbar
          acceptableCount={acceptableCount}
          isAccepting={isAcceptingAll}
          isDeleting={isDeletingAll}
          needsReviewCount={needsReviewCount}
          onAcceptAll={handleAcceptAll}
          onDeleteAll={handleDeleteAll}
          readyCount={readyCount}
          totalCount={totalCount}
        />

        <InboxTable
          accountLabelByKey={accountLabelByKey}
          editingTradeId={editingTradeId}
          editInitialValues={editInitialValues}
          inlinePortfolioIds={inlinePortfolioIds}
          inboxTrades={typedTrades}
          priceMappingByInboxTradeId={priceMappingByInboxTradeId}
          onAccept={handleAccept}
          onCancelEdit={handleCancelEdit}
          onDelete={(inboxTradeId) => {
            void deleteInboxTrade({ inboxTradeId }).catch((error) => {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Failed to delete trade",
              );
            });
          }}
          onEdit={handleEdit}
          onInlinePortfolioChange={(inboxTradeId, value) => {
            setInlinePortfolioIds((prev) => ({
              ...prev,
              [inboxTradeId]: value,
            }));
            persistPortfolioSelection(inboxTradeId, value);
          }}
          onSaveEdit={handleSaveEdit}
          portfolios={portfolios}
        />
      </div>
    </div>
  );
}
