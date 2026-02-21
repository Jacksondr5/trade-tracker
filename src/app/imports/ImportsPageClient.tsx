"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import type { BrokerageSource } from "../../../shared/imports/types";
import {
  EditTradeForm,
  type EditTradeFormValues,
} from "./components/edit-trade-form";
import { InboxTable } from "./components/inbox-table";
import { UploadSection } from "./components/upload-section";
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
  preloadedInboxTrades,
  preloadedOpenTradePlans,
}: {
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedInboxTrades: Preloaded<typeof api.imports.listInboxTrades>;
  preloadedOpenTradePlans: Preloaded<typeof api.tradePlans.listOpenTradePlans>;
}) {
  const [brokerage, setBrokerage] = useState<BrokerageSource>("ibkr");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingTradeId, setEditingTradeId] =
    useState<Id<"inboxTrades"> | null>(null);
  const [editInitialValues, setEditInitialValues] =
    useState<EditTradeFormValues>(DEFAULT_EDIT_VALUES);

  const inboxTrades = usePreloadedQuery(preloadedInboxTrades);
  const openTradePlansRaw = usePreloadedQuery(preloadedOpenTradePlans);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const openTradePlans = (openTradePlansRaw ?? undefined) as
    | OpenTradePlanOption[]
    | undefined;
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

  const { importResult, isImporting, setImportResult, handleFileChange } =
    useImportUpload({
      brokerage,
      importTrades: importTradesMutation,
      setErrorMessage,
    });

  const {
    inlineNotes,
    inlineTradePlanIds,
    setInlineNotes,
    setInlineTradePlanIds,
  } = useInlineInboxEdits(inboxTrades as InboxTrade[] | undefined);

  const onBrokerageChange = (value: BrokerageSource) => {
    setBrokerage(value);
    setImportResult(null);
  };

  const persistTradePlanSelection = (
    inboxTradeId: Id<"inboxTrades">,
    value: string,
  ) => {
    void updateInboxTrade({
      inboxTradeId,
      tradePlanId: value ? (value as Id<"tradePlans">) : null,
    }).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update trade plan",
      );
    });
  };

  const persistNotes = (inboxTradeId: Id<"inboxTrades">, value: string) => {
    void updateInboxTrade({
      inboxTradeId,
      notes: value || null,
    }).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update notes",
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
    if (!trade || !isTradeReadyForAcceptance(trade)) return;

    const tradePlanId = inlineTradePlanIds[inboxTradeId] || undefined;
    const notesValue = inlineNotes[inboxTradeId] || undefined;

    void acceptTrade({
      inboxTradeId,
      notes: notesValue,
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
    try {
      if (inboxTrades) {
        await Promise.all(
          inboxTrades.map((trade) => {
            const selected = inlineTradePlanIds[trade._id] ?? "";
            const notes = inlineNotes[trade._id] ?? "";
            const tradePlanChanged =
              selected !== (trade.tradePlanId ? String(trade.tradePlanId) : "");
            const notesChanged = notes !== (trade.notes ?? "");
            if (!tradePlanChanged && !notesChanged) return Promise.resolve();

            return updateInboxTrade({
              inboxTradeId: trade._id,
              notes: notes || null,
              tradePlanId: selected ? (selected as Id<"tradePlans">) : null,
            });
          }),
        );
      }

      const result = await acceptAllTrades();
      const messages: string[] = [];
      if (result.accepted > 0) messages.push(`Accepted ${result.accepted}`);
      if (result.skippedInvalid > 0)
        messages.push(`${result.skippedInvalid} need review`);
      if (result.errors.length > 0)
        messages.push(`Errors: ${result.errors.slice(0, 3).join("; ")}`);

      if (result.skippedInvalid > 0 || result.errors.length > 0) {
        setErrorMessage(messages.join(". "));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Accept all failed",
      );
    }
  };

  const handleDeleteAll = () => {
    void deleteAllInboxTrades().catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete all trades",
      );
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Import Trades</h1>

      <UploadSection
        brokerage={brokerage}
        errorMessage={errorMessage}
        importResult={importResult}
        isImporting={isImporting}
        onBrokerageChange={onBrokerageChange}
        onFileChange={handleFileChange}
      />

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
                onClick={() => void handleAcceptAll()}
                variant="outline"
              >
                Accept All ({inboxTrades.length})
              </Button>
              <Button
                dataTestId="delete-all-trades-button"
                onClick={handleDeleteAll}
                variant="outline"
              >
                Delete All
              </Button>
            </div>
          )}
        </div>

        {editingTradeId && (
          <EditTradeForm
            key={editingTradeId}
            initialValues={editInitialValues}
            onCancel={() => {
              setEditingTradeId(null);
              setEditInitialValues(DEFAULT_EDIT_VALUES);
            }}
            onSave={handleSaveEdit}
          />
        )}

        <InboxTable
          accountLabelByKey={accountLabelByKey}
          editingTradeId={editingTradeId}
          inlineNotes={inlineNotes}
          inlineTradePlanIds={inlineTradePlanIds}
          inboxTrades={inboxTrades as InboxTrade[] | undefined}
          onAccept={handleAccept}
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
          onInlineNotesBlur={persistNotes}
          onInlineNotesChange={(inboxTradeId, value) => {
            setInlineNotes((prev) => ({
              ...prev,
              [inboxTradeId]: value,
            }));
          }}
          onInlineTradePlanChange={(inboxTradeId, value) => {
            setInlineTradePlanIds((prev) => ({
              ...prev,
              [inboxTradeId]: value,
            }));
            persistTradePlanSelection(inboxTradeId, value);
          }}
          openTradePlans={openTradePlans}
        />
      </div>
    </div>
  );
}
