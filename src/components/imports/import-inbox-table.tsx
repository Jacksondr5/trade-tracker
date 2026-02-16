"use client";

import React from "react";
import { Button } from "~/components/ui";

export type ImportInboxRow = {
  _id: string;
  brokerAccountRef?: string;
  date: number;
  price: number;
  provider: "ibkr" | "kraken" | "manual";
  quantity: number;
  side: "buy" | "sell";
  suggestedTradePlanId?: string;
  suggestionReason?: "none" | "symbol_and_side_match";
  symbol: string;
  tradePlanId?: string;
};

type Option = { id: string; label: string };

export function ImportInboxTable({
  campaigns,
  onSave,
  rows,
  selectedCampaignIds,
  selectedTradePlanIds,
  tradePlans,
}: {
  campaigns: Option[];
  onSave: (tradeId: string) => void;
  rows: ImportInboxRow[];
  selectedCampaignIds: Record<string, string | undefined>;
  selectedTradePlanIds: Record<string, string | undefined>;
  tradePlans: Option[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 text-slate-300">
        No pending imported trades.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full bg-slate-900 text-sm text-slate-200">
        <thead className="bg-slate-800 text-left text-slate-300">
          <tr>
            <th className="px-3 py-2">Provider</th>
            <th className="px-3 py-2">Account</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Suggested Plan</th>
            <th className="px-3 py-2">Selected Plan</th>
            <th className="px-3 py-2">Selected Campaign</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id} className="border-t border-slate-800 align-top">
              <td className="px-3 py-2 uppercase">{row.provider}</td>
              <td className="px-3 py-2">{row.brokerAccountRef ?? "-"}</td>
              <td className="px-3 py-2">{row.symbol}</td>
              <td className="px-3 py-2 uppercase">{row.side}</td>
              <td className="px-3 py-2">{row.quantity}</td>
              <td className="px-3 py-2">{row.price}</td>
              <td className="px-3 py-2">{new Date(row.date).toLocaleString()}</td>
              <td className="px-3 py-2">
                {row.suggestedTradePlanId ?? (row.suggestionReason === "none" ? "None" : "-")}
              </td>
              <td className="px-3 py-2">
                <select
                  className="rounded border border-slate-600 bg-slate-800 px-2 py-1"
                  defaultValue={selectedTradePlanIds[row._id] ?? row.tradePlanId ?? ""}
                  name={`trade-plan-${row._id}`}
                >
                  <option value="">None</option>
                  {tradePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <select
                  className="rounded border border-slate-600 bg-slate-800 px-2 py-1"
                  defaultValue={selectedCampaignIds[row._id] ?? ""}
                  name={`campaign-${row._id}`}
                >
                  <option value="">None</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <Button
                  dataTestId={`save-import-row-${row._id}`}
                  onClick={() => onSave(row._id)}
                  size="sm"
                >
                  Save
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
