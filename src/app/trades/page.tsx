"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Button } from "~/components/ui";
import { api } from "../../../convex/_generated/api";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export default function TradesPage() {
  const trades = useQuery(api.trades.listTrades);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Trades</h1>
        <Link href="/trades/new">
          <Button dataTestId="new-trade-button">New Trade</Button>
        </Link>
      </div>

      {trades === undefined ? (
        <div className="text-slate-11">Loading trades...</div>
      ) : trades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No trades yet.</p>
          <p className="text-slate-11 mt-2 text-sm">
            Click &quot;New Trade&quot; to record your first trade.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Date
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Ticker
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Side
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Direction
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Price
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Quantity
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {trades.map((trade) => (
                <tr
                  key={trade._id}
                  className="hover:bg-slate-800/50"
                  data-testid={`trade-row-${trade._id}`}
                >
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">
                    {formatDate(trade.date)}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {trade.ticker}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`text-slate-12 rounded px-2 py-0.5 ${
                        trade.side === "buy"
                          ? "border border-green-700 bg-green-900/50"
                          : "border border-red-700 bg-red-900/50"
                      }`}
                    >
                      {trade.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                    {trade.direction}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {formatCurrency(trade.price)}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {trade.quantity}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                    {formatCurrency(trade.price * trade.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
