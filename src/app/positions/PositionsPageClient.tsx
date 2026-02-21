"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "~/convex/_generated/api";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export default function PositionsPageClient({
  preloadedPositions,
}: {
  preloadedPositions: Preloaded<typeof api.positions.getPositions>;
}) {
  const positions = usePreloadedQuery(preloadedPositions);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Positions</h1>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No open positions.</p>
          <p className="text-slate-11 mt-2 text-sm">
            Your open positions will appear here when you have active trades.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Ticker
                </th>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Direction
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Quantity
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Average Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {positions.map((position) => (
                <tr
                  key={`${position.ticker}-${position.direction}`}
                  className="hover:bg-slate-800/50"
                  data-testid={`position-row-${position.ticker}-${position.direction}`}
                >
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {position.ticker}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`text-slate-12 rounded px-2 py-0.5 ${
                        position.direction === "long"
                          ? "border border-green-700 bg-green-900/50"
                          : "border border-red-700 bg-red-900/50"
                      }`}
                    >
                      {position.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {position.quantity}
                  </td>
                  <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {formatCurrency(position.averageCost)}
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
