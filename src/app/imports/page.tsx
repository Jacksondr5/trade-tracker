"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  ImportInboxTable,
  type ImportInboxRow,
} from "~/components/imports/import-inbox-table";
import { ImportSyncControls } from "~/components/imports/import-sync-controls";

export default function ImportsPage() {
  const inboxRows = (useQuery((api as any).imports.listInboxRows) ?? []) as Array<{
    _id: string;
    brokerAccountRef?: string;
    date: number;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    source: "ibkr" | "kraken" | "manual";
    suggestedTradePlanId?: string;
    suggestionReason?: "none" | "symbol_and_side_match";
    ticker: string;
    tradePlanId?: string;
  }>;
  const tradePlans = useQuery(api.tradePlans.listTradePlans, {}) ?? [];
  const campaigns = useQuery(api.campaigns.listCampaigns) ?? [];

  const syncNow = useMutation((api as any).imports.syncNow);
  const reviewImportedTrade = useMutation((api as any).imports.reviewImportedTrade);

  const [isSyncing, setIsSyncing] = useState(false);

  const rows: ImportInboxRow[] = useMemo(
    () =>
      inboxRows.map((row) => ({
        _id: row._id,
        brokerAccountRef: row.brokerAccountRef,
        date: row.date,
        price: row.price,
        provider: row.source,
        quantity: row.quantity,
        side: row.side,
        suggestedTradePlanId: row.suggestedTradePlanId,
        suggestionReason: row.suggestionReason,
        symbol: row.ticker,
        tradePlanId: row.tradePlanId,
      })),
    [inboxRows],
  );

  const tradePlanOptions = useMemo(
    () => tradePlans.map((plan) => ({ id: plan._id, label: plan.name })),
    [tradePlans],
  );
  const campaignOptions = useMemo(
    () => campaigns.map((campaign) => ({ id: campaign._id, label: campaign.name })),
    [campaigns],
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-100">Import Inbox</h1>
      <ImportSyncControls
        isSyncing={isSyncing}
        onSyncNow={async () => {
          setIsSyncing(true);
          try {
            await syncNow({});
          } finally {
            setIsSyncing(false);
          }
        }}
      />
      <ImportInboxTable
        campaigns={campaignOptions}
        onSave={async (tradeId) => {
          await reviewImportedTrade({ tradeId });
        }}
        rows={rows}
        selectedCampaignIds={{}}
        selectedTradePlanIds={{}}
        tradePlans={tradePlanOptions}
      />
    </div>
  );
}
