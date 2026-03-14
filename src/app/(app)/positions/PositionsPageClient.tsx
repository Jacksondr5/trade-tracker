"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { Badge } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import { formatCurrency } from "~/lib/format";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";

export default function PositionsPageClient({
  preloadedPositions,
}: {
  preloadedPositions: Preloaded<typeof api.positions.getPositions>;
}) {
  const positions = usePreloadedQuery(preloadedPositions);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.positions}
        >
          Positions
        </h1>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No open positions.</p>
          <p className="mt-2 text-sm text-slate-11">
            Your open positions will appear here when you have active trades.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                  Ticker
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                  Direction
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                  Quantity
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
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
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap text-slate-12">
                    {position.ticker}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <Badge
                      variant={
                        position.direction === "long" ? "success" : "danger"
                      }
                    >
                      {position.direction.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-slate-12">
                    {position.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-slate-12">
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
