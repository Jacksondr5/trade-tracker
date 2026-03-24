"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Alert, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";
import type { BrokerageSource } from "../../../../shared/imports/types";
import { type EditTradeFormValues } from "./components/edit-trade-form";
import { InboxTable } from "./components/inbox-table";
import { InboxToolbar } from "./components/inbox-toolbar";
import { useImportUpload } from "./hooks/use-import-upload";
import { useInlineInboxEdits } from "./hooks/use-inline-inbox-edits";
import type { InboxTrade, OpenTradePlanOption } from "./types";
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
  preloadedCampaigns,
  preloadedInboxTrades,
  preloadedOpenTradePlans,
  preloadedPortfolios,
}: {
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedCampaigns: Preloaded<typeof api.campaigns.listCampaigns>;
  preloadedInboxTrades: Preloaded<typeof api.imports.listInboxTrades>;
  preloadedOpenTradePlans: Preloaded<typeof api.tradePlans.listOpenTradePlans>;
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
  const openTradePlansRaw = usePreloadedQuery(preloadedOpenTradePlans);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const allCampaigns = usePreloadedQuery(preloadedCampaigns);
  const openTradePlans = (openTradePlansRaw ?? undefined) as
    | OpenTradePlanOption[]
    | undefined;
  const campaigns = useMemo(
    () =>
      allCampaigns?.filter(
        (c) => c.status === "active" || c.status === "planning",
      ),
    [allCampaigns],
  );

  const createTradePlan = useMutation(api.tradePlans.createTradePlan);

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
  const acceptTrade = useMutation(api.imports.acceptTrade);
  const acceptAllTrades = useMutation(api.imports.acceptAllTrades);
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

  const {
    inlinePortfolioIds,
    inlineTradePlanIds,
    setInlinePortfolioIds,
    setInlineTradePlanIds,
  } = useInlineInboxEdits(inboxTrades as InboxTrade[] | undefined);

  // Compute summary counts
  const typedTrades = inboxTrades as InboxTrade[] | undefined;
  const totalCount = typedTrades?.length ?? 0;

  // "Ready" = valid fields + has portfolio + has trade plan (green)
  const readyCount = useMemo(
    () =>
      typedTrades?.filter((t) => {
        const hasPortfolio = (inlinePortfolioIds[t._id] ?? "") !== "";
        const hasTradePlan = (inlineTradePlanIds[t._id] ?? "") !== "";
        return (
          t.validationErrors.length === 0 &&
          isTradeReadyForAcceptance(t) &&
          hasPortfolio &&
          hasTradePlan
        );
      }).length ?? 0,
    [typedTrades, inlinePortfolioIds, inlineTradePlanIds],
  );

  // "Missing plan" = valid + has portfolio but no trade plan (amber)
  const missingPlanCount = useMemo(
    () =>
      typedTrades?.filter((t) => {
        const hasPortfolio = (inlinePortfolioIds[t._id] ?? "") !== "";
        const hasTradePlan = (inlineTradePlanIds[t._id] ?? "") !== "";
        return (
          t.validationErrors.length === 0 &&
          isTradeReadyForAcceptance(t) &&
          hasPortfolio &&
          !hasTradePlan
        );
      }).length ?? 0,
    [typedTrades, inlinePortfolioIds, inlineTradePlanIds],
  );

  // "Needs review" = everything else (red)
  const needsReviewCount = totalCount - readyCount - missingPlanCount;

  // Acceptable = can be accepted (ready + missing-plan)
  const acceptableCount = readyCount + missingPlanCount;

  const onBrokerageChange = (value: BrokerageSource) => {
    setBrokerage(value);
    setImportResult(null);
  };

  const persistTradePlanSelection = async (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ): Promise<boolean> => {
    try {
      await updateInboxTrade({
        inboxTradeId,
        tradePlanId: value ? (value as Id<"tradePlans">) : null,
      });
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update trade plan",
      );
      return false;
    }
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

  const handleQuickCreateTradePlan = async (
    inboxTradeId: Id<"inboxTrades">,
    args: {
      name: string;
      instrumentSymbol: string;
      campaignId?: Id<"campaigns">;
    },
  ): Promise<boolean> => {
    try {
      const newPlanId = await createTradePlan({
        campaignId: args.campaignId,
        instrumentSymbol: args.instrumentSymbol,
        name: args.name,
      });
      const previousTradePlanId = inlineTradePlanIds[inboxTradeId] ?? "";
      setInlineTradePlanIds((prev) => ({
        ...prev,
        [inboxTradeId]: newPlanId,
      }));
      const persisted = await persistTradePlanSelection(
        inboxTradeId,
        newPlanId,
      );
      if (!persisted) {
        setInlineTradePlanIds((prev) => ({
          ...prev,
          [inboxTradeId]: previousTradePlanId,
        }));
        return false;
      }
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create trade plan",
      );
      return false;
    }
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
    if (!trade || !isTradeReadyForAcceptance(trade) || !portfolioId) return;

    const tradePlanId = inlineTradePlanIds[inboxTradeId] || undefined;

    void acceptTrade({
      inboxTradeId,
      portfolioId: portfolioId ? (portfolioId as Id<"portfolios">) : undefined,
      tradePlanId: tradePlanId ? (tradePlanId as Id<"tradePlans">) : undefined,
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
            const selected = inlineTradePlanIds[trade._id] ?? "";
            const portfolio = inlinePortfolioIds[trade._id] ?? "";
            const tradePlanChanged =
              selected !== (trade.tradePlanId ? String(trade.tradePlanId) : "");
            const portfolioChanged =
              portfolio !==
              (trade.portfolioId ? String(trade.portfolioId) : "");
            if (!tradePlanChanged && !portfolioChanged)
              return Promise.resolve();

            return updateInboxTrade({
              inboxTradeId: trade._id,
              portfolioId: portfolio ? (portfolio as Id<"portfolios">) : null,
              tradePlanId: selected ? (selected as Id<"tradePlans">) : null,
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
          error instanceof Error ? error.message : "Failed to delete all trades",
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
        <div className="ml-auto flex items-center gap-3">
          <label
            htmlFor="csv-file-input"
            className="flex h-9 cursor-pointer items-center rounded-md border border-olive-6 bg-olive-3 px-3 text-sm text-olive-12 hover:bg-olive-4"
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
          <select
            id="brokerage-select"
            value={brokerage}
            onChange={(e) =>
              onBrokerageChange(e.target.value as BrokerageSource)
            }
            className="h-9 rounded-md border border-olive-6 bg-olive-3 px-3 py-1 text-sm text-olive-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
          >
            <option value="ibkr">Interactive Brokers (IBKR)</option>
            <option value="kraken">Kraken</option>
          </select>
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
          missingPlanCount={missingPlanCount}
          needsReviewCount={needsReviewCount}
          onAcceptAll={handleAcceptAll}
          onDeleteAll={handleDeleteAll}
          readyCount={readyCount}
          totalCount={totalCount}
        />

        <InboxTable
          accountLabelByKey={accountLabelByKey}
          campaigns={campaigns}
          editingTradeId={editingTradeId}
          editInitialValues={editInitialValues}
          inlinePortfolioIds={inlinePortfolioIds}
          inlineTradePlanIds={inlineTradePlanIds}
          inboxTrades={typedTrades}
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
          onInlineTradePlanChange={(inboxTradeId, value) => {
            const previousTradePlanId = inlineTradePlanIds[inboxTradeId] ?? "";
            const attemptedTradePlanId = value;
            setInlineTradePlanIds((prev) => ({
              ...prev,
              [inboxTradeId]: attemptedTradePlanId,
            }));
            void persistTradePlanSelection(
              inboxTradeId,
              attemptedTradePlanId,
            ).then((persisted) => {
              if (!persisted) {
                setInlineTradePlanIds((prev) => {
                  if ((prev[inboxTradeId] ?? "") !== attemptedTradePlanId) {
                    return prev;
                  }
                  return {
                    ...prev,
                    [inboxTradeId]: previousTradePlanId,
                  };
                });
              }
            });
          }}
          onQuickCreateTradePlan={handleQuickCreateTradePlan}
          onSaveEdit={handleSaveEdit}
          openTradePlans={openTradePlans}
          portfolios={portfolios}
        />
      </div>
    </div>
  );
}
