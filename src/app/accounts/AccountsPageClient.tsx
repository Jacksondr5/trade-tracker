"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  Button,
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
} from "../../../shared/imports/constants";

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
    if (isSavingEdit) return;

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
      <h1 className="text-slate-12 text-2xl font-bold">
        Account Name Mappings
      </h1>

      <Card className="bg-slate-800">
        <CardHeader>
          <CardTitle>Detected Brokerage Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage && (
            <p className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          )}
          {knownAccounts.length === 0 ? (
            <p className="text-slate-11 text-sm">
              No brokerage account IDs detected in imports or trades yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full table-auto">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                      Brokerage
                    </th>
                    <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                      Account ID
                    </th>
                    <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                      Trades
                    </th>
                    <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                      Inbox
                    </th>
                    <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                      Mapped Name
                    </th>
                    <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
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
                        <td className="text-slate-12 px-4 py-3 text-sm">
                          {SOURCE_LABELS[account.source]}
                        </td>
                        <td className="text-slate-12 px-4 py-3 font-mono text-sm">
                          {isKrakenDefaultAccountId(account.accountId)
                            ? "Kraken (Default)"
                            : account.accountId}
                        </td>
                        <td className="text-slate-12 px-4 py-3 text-right text-sm">
                          {account.tradeCount}
                        </td>
                        <td className="text-slate-12 px-4 py-3 text-right text-sm">
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
                              <Button
                                dataTestId={`save-mapping-${key}`}
                                isLoading={isSavingEdit}
                                onClick={() => void saveEditing(account)}
                                size="sm"
                                type="button"
                              >
                                Save
                              </Button>
                              <Button
                                dataTestId={`cancel-mapping-${key}`}
                                disabled={isSavingEdit}
                                onClick={cancelEditing}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              dataTestId={`edit-mapping-${key}`}
                              onClick={() => startEditing(account)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Edit
                            </Button>
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
