"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../shared/imports/constants";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";

type MappingSource = "ibkr" | "kraken";

type KnownAccount = {
  accountId: string;
  inboxTradeCount: number;
  source: MappingSource;
  tradeCount: number;
};

const SOURCE_LABELS: Record<MappingSource, string> = {
  ibkr: "IBKR",
  kraken: "Kraken",
};

export default function AccountsPageClient({
  preloadedKnownAccounts,
  preloadedMappings,
}: {
  preloadedKnownAccounts: Preloaded<
    typeof api.accountMappings.listKnownBrokerageAccounts
  >;
  preloadedMappings: Preloaded<typeof api.accountMappings.listAccountMappings>;
}) {
  const mappings = usePreloadedQuery(preloadedMappings);
  const knownAccounts = usePreloadedQuery(preloadedKnownAccounts);

  const upsertAccountMapping = useMutation(
    api.accountMappings.upsertAccountMapping,
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingFriendlyName, setEditingFriendlyName] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const mappingNameByKey = useMemo(
    () =>
      new Map(
        mappings.map((mapping) => [
          `${mapping.source}|${mapping.accountId}`,
          mapping.friendlyName,
        ]),
      ),
    [mappings],
  );

  const startEditing = (account: KnownAccount) => {
    if (isSavingEdit) return;

    const key = `${account.source}|${account.accountId}`;
    const existingName = mappingNameByKey.get(key);

    setEditingKey(key);
    setEditingFriendlyName(
      existingName ??
        (account.source === "kraken" &&
        isKrakenDefaultAccountId(account.accountId)
          ? KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME
          : ""),
    );
    setErrorMessage(null);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditingFriendlyName("");
    setErrorMessage(null);
  };

  const saveEditing = async (account: KnownAccount) => {
    const nextName = editingFriendlyName.trim();
    if (!nextName) {
      setErrorMessage("Friendly name is required.");
      return;
    }

    setErrorMessage(null);
    setIsSavingEdit(true);

    try {
      await upsertAccountMapping({
        accountId: account.accountId,
        friendlyName: nextName,
        source: account.source,
      });
      cancelEditing();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save mapping",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <h1
        className="text-2xl font-bold text-slate-12"
        data-testid={APP_PAGE_TITLES.accounts}
      >
        Account Name Mappings
      </h1>

      <Card className="bg-slate-800">
        <CardHeader>
          <CardTitle>Detected Brokerage Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage && (
            <Alert variant="error" className="mb-3">
              {errorMessage}
            </Alert>
          )}
          {knownAccounts.length === 0 ? (
            <p className="text-sm text-slate-11">
              No brokerage account IDs detected in imports or trades yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full table-auto">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                      Brokerage
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                      Account ID
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                      Trades
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                      Inbox
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                      Mapped Name
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-slate-900">
                  {knownAccounts.map((account) => {
                    const key = `${account.source}|${account.accountId}`;
                    const mappedName = mappingNameByKey.get(key);
                    const isEditing = editingKey === key;

                    return (
                      <tr key={key} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-12">
                          {SOURCE_LABELS[account.source]}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-12">
                          {isKrakenDefaultAccountId(account.accountId)
                            ? "Kraken (Default)"
                            : account.accountId}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-12">
                          {account.tradeCount}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-12">
                          {account.inboxTradeCount}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <Input
                              dataTestId={`edit-mapping-name-${key}`}
                              disabled={isSavingEdit}
                              onChange={(event) => {
                                if (isSavingEdit) return;
                                setEditingFriendlyName(event.target.value);
                              }}
                              placeholder="Friendly name"
                              value={editingFriendlyName}
                            />
                          ) : (
                            <span className="text-slate-11">
                              {mappedName ?? "Not mapped"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                aria-label="Save mapping"
                                title="Save"
                                data-testid={`save-mapping-${key}`}
                                className="rounded p-1.5 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
                                onClick={() => void saveEditing(account)}
                                disabled={isSavingEdit}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel editing"
                                title="Cancel"
                                data-testid={`cancel-mapping-${key}`}
                                className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-slate-12 disabled:opacity-50"
                                onClick={cancelEditing}
                                disabled={isSavingEdit}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label="Edit mapping"
                              title="Edit"
                              data-testid={`edit-mapping-${key}`}
                              className="rounded p-1.5 text-slate-11 hover:bg-slate-700 hover:text-slate-12"
                              onClick={() => startEditing(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
