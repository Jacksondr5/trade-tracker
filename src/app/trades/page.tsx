"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
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

function formatPL(value: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

// Helper to format date for input[type="date"]
function formatDateForInput(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split("T")[0];
}

// Helper to parse date string to timestamp (start of day)
function parseDateToTimestamp(dateStr: string, endOfDay = false): number {
  const date = new Date(dateStr);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.getTime();
}

type QuickFilter = "today" | "week" | "month" | "year" | "all";

// Get date range for quick filters
function getQuickFilterRange(filter: QuickFilter): { start: number | null; end: number | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (filter) {
    case "today":
      return {
        start: today.getTime(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).getTime(),
      };
    case "week": {
      // Start of this week (Sunday)
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      return {
        start: startOfWeek.getTime(),
        end: now.getTime(),
      };
    }
    case "month": {
      // Start of this month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: startOfMonth.getTime(),
        end: now.getTime(),
      };
    }
    case "year": {
      // Start of this year
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return {
        start: startOfYear.getTime(),
        end: now.getTime(),
      };
    }
    case "all":
    default:
      return { start: null, end: null };
  }
}

export default function TradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const trades = useQuery(api.trades.listTrades);
  const campaigns = useQuery(api.campaigns.listCampaigns);

  // Get filter values from URL params
  const startDateParam = searchParams.get("start");
  const endDateParam = searchParams.get("end");
  
  // Parse date params to timestamps
  const startDate = startDateParam ? parseDateToTimestamp(startDateParam) : null;
  const endDate = endDateParam ? parseDateToTimestamp(endDateParam, true) : null;

  // Update URL with filter params
  const updateFilters = useCallback(
    (start: number | null, end: number | null) => {
      const params = new URLSearchParams();
      if (start !== null) {
        params.set("start", formatDateForInput(start));
      }
      if (end !== null) {
        params.set("end", formatDateForInput(end));
      }
      const queryString = params.toString();
      router.push(`/trades${queryString ? `?${queryString}` : ""}`);
    },
    [router]
  );

  // Apply quick filter
  const applyQuickFilter = useCallback(
    (filter: QuickFilter) => {
      const { start, end } = getQuickFilterRange(filter);
      updateFilters(start, end);
    },
    [updateFilters]
  );

  // Determine which quick filter is currently active
  const activeQuickFilter = useMemo((): QuickFilter | null => {
    if (startDate === null && endDate === null) return "all";
    
    // Check if it matches any quick filter
    const todayRange = getQuickFilterRange("today");
    if (startDate === todayRange.start) return "today";
    
    const weekRange = getQuickFilterRange("week");
    if (startDate === weekRange.start) return "week";
    
    const monthRange = getQuickFilterRange("month");
    if (startDate === monthRange.start) return "month";
    
    const yearRange = getQuickFilterRange("year");
    if (startDate === yearRange.start) return "year";
    
    return null;
  }, [startDate, endDate]);

  // Create a lookup map for campaign names
  const campaignNameMap = useMemo(() => {
    if (!campaigns) return new Map<string, string>();
    return new Map(campaigns.map((c) => [c._id, c.name]));
  }, [campaigns]);

  // Filter trades by date range
  const filteredTrades = useMemo(() => {
    if (!trades) return undefined;
    
    return trades.filter((trade) => {
      if (startDate !== null && trade.date < startDate) return false;
      if (endDate !== null && trade.date > endDate) return false;
      return true;
    });
  }, [trades, startDate, endDate]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Trades</h1>
        <Link href="/trades/new">
          <Button dataTestId="new-trade-button">New Trade</Button>
        </Link>
      </div>

      {/* Date filter controls */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Quick filter buttons */}
          <div className="flex flex-wrap gap-2">
            {(["today", "week", "month", "year", "all"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => applyQuickFilter(filter)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeQuickFilter === filter
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {filter === "today"
                  ? "Today"
                  : filter === "week"
                    ? "This Week"
                    : filter === "month"
                      ? "This Month"
                      : filter === "year"
                        ? "This Year"
                        : "All Time"}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex items-center gap-2">
            <span className="text-slate-11 text-sm">or</span>
            <input
              type="date"
              value={startDate ? formatDateForInput(startDate) : ""}
              onChange={(e) =>
                updateFilters(
                  e.target.value ? parseDateToTimestamp(e.target.value) : null,
                  endDate
                )
              }
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none"
              aria-label="Start date"
            />
            <span className="text-slate-11 text-sm">to</span>
            <input
              type="date"
              value={endDate ? formatDateForInput(endDate) : ""}
              onChange={(e) =>
                updateFilters(
                  startDate,
                  e.target.value ? parseDateToTimestamp(e.target.value, true) : null
                )
              }
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none"
              aria-label="End date"
            />
          </div>
        </div>

        {/* Show filter status */}
        {(startDate !== null || endDate !== null) && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-slate-11 text-sm">
              Showing {filteredTrades?.length ?? 0} of {trades?.length ?? 0} trades
            </span>
            <button
              onClick={() => updateFilters(null, null)}
              className="text-blue-400 text-sm hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {filteredTrades === undefined ? (
        <div className="text-slate-11">Loading trades...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {startDate !== null || endDate !== null
              ? "No trades in selected date range."
              : "No trades yet."}
          </p>
          {startDate === null && endDate === null && (
            <p className="text-slate-11 mt-2 text-sm">
              Click &quot;New Trade&quot; to record your first trade.
            </p>
          )}
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
                  Campaign
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
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  P&L
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {filteredTrades.map((trade) => (
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
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                    {trade.campaignId
                      ? campaignNameMap.get(trade.campaignId) ?? "—"
                      : "—"}
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
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${
                      trade.realizedPL === null
                        ? "text-slate-11"
                        : trade.realizedPL >= 0
                          ? "text-green-400"
                          : "text-red-400"
                    }`}
                  >
                    {trade.realizedPL === null ? "—" : formatPL(trade.realizedPL)}
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
