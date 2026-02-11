"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
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

/**
 * Parse a YYYY-MM-DD date string as local time (not UTC).
 * This avoids timezone issues where new Date("2026-01-15") might return Jan 14 or 15
 * depending on the user's timezone.
 */
function parseDateInputLocal(dateString: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const [yearString, monthString, dayString] = dateString.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const parsedDate = new Date(year, month - 1, day);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  // Prevent overflow dates like 2026-02-31 becoming Mar 03.
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function getStartOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

type QuickFilter = "today" | "week" | "month" | "year" | "all";
const QUICK_FILTER_VALUES = ["today", "week", "month", "year", "all"] as const;

function isQuickFilter(value: string): value is QuickFilter {
  return QUICK_FILTER_VALUES.includes(value as QuickFilter);
}

export default function TradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trades = useQuery(api.trades.listTrades);
  const tradePlans = useQuery(api.tradePlans.listTradePlans, {});

  // Get filter params from URL
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");
  const rawQuickFilterParam = searchParams.get("filter");
  const quickFilterParam =
    rawQuickFilterParam && isQuickFilter(rawQuickFilterParam)
      ? rawQuickFilterParam
      : null;

  // Create a lookup map for trade plan names
  const tradePlanNameMap = useMemo(() => {
    if (!tradePlans) return new Map<string, string>();
    return new Map(tradePlans.map((p) => [p._id, p.name]));
  }, [tradePlans]);

  // Calculate date range based on quick filter or custom dates
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();

    if (quickFilterParam) {
      switch (quickFilterParam) {
        case "today":
          return {
            endDate: getEndOfDay(now),
            startDate: getStartOfDay(now),
          };
        case "week":
          return {
            endDate: getEndOfDay(now),
            startDate: getStartOfWeek(now).getTime(),
          };
        case "month":
          return {
            endDate: getEndOfDay(now),
            startDate: getStartOfMonth(now).getTime(),
          };
        case "year":
          return {
            endDate: getEndOfDay(now),
            startDate: getStartOfYear(now).getTime(),
          };
        case "all":
        default:
          return { endDate: null, startDate: null };
      }
    }

    // Use custom date range if provided - parse as local time to avoid timezone issues
    const parsedStartDate = startDateParam
      ? parseDateInputLocal(startDateParam)
      : null;
    const parsedEndDate = endDateParam ? parseDateInputLocal(endDateParam) : null;
    const start = parsedStartDate ? getStartOfDay(parsedStartDate) : null;
    const end = parsedEndDate ? getEndOfDay(parsedEndDate) : null;

    return { endDate: end, startDate: start };
  }, [quickFilterParam, startDateParam, endDateParam]);

  // Filter trades based on date range
  const filteredTrades = useMemo(() => {
    if (!trades) return undefined;
    if (startDate === null && endDate === null) return trades;

    return trades.filter((trade) => {
      if (startDate !== null && trade.date < startDate) return false;
      if (endDate !== null && trade.date > endDate) return false;
      return true;
    });
  }, [trades, startDate, endDate]);

  // Update URL with filter params
  const updateFilter = (params: {
    endDate?: string | null;
    filter?: QuickFilter | null;
    startDate?: string | null;
  }) => {
    const newParams = new URLSearchParams();

    if (params.filter && params.filter !== "all") {
      newParams.set("filter", params.filter);
    } else if (params.filter !== "all") {
      // Only set date params if not using quick filter
      if (params.startDate) newParams.set("startDate", params.startDate);
      if (params.endDate) newParams.set("endDate", params.endDate);
    }

    const queryString = newParams.toString();
    router.push(queryString ? `/trades?${queryString}` : "/trades");
  };

  const handleQuickFilter = (filter: QuickFilter) => {
    updateFilter({ filter });
  };

  const handleCustomDateChange = (
    type: "startDate" | "endDate",
    value: string
  ) => {
    const currentStart = startDateParam || "";
    const currentEnd = endDateParam || "";

    updateFilter({
      endDate: type === "endDate" ? value : currentEnd,
      filter: null,
      startDate: type === "startDate" ? value : currentStart,
    });
  };

  const isQuickFilterActive = (filter: QuickFilter): boolean => {
    if (filter === "all") {
      return !quickFilterParam && startDate === null && endDate === null;
    }
    return quickFilterParam === filter;
  };

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
            {(
              [
                { label: "Today", value: "today" },
                { label: "This Week", value: "week" },
                { label: "This Month", value: "month" },
                { label: "This Year", value: "year" },
                { label: "All Time", value: "all" },
              ] as const
            ).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => handleQuickFilter(value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  isQuickFilterActive(value)
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex items-center gap-2">
            <span className="text-slate-11 text-sm">or</span>
            <input
              type="date"
              value={startDateParam || ""}
              onChange={(e) => handleCustomDateChange("startDate", e.target.value)}
              className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none"
              aria-label="Start date"
            />
            <span className="text-slate-11 text-sm">to</span>
            <input
              type="date"
              value={endDateParam || ""}
              onChange={(e) => handleCustomDateChange("endDate", e.target.value)}
              className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none"
              aria-label="End date"
            />
          </div>
        </div>
      </div>

      {filteredTrades === undefined ? (
        <div className="text-slate-11">Loading trades...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {trades && trades.length > 0
              ? "No trades found for the selected date range."
              : "No trades yet."}
          </p>
          {trades && trades.length === 0 && (
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
                  Trade Plan
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
                  P&amp;L
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
                    {trade.tradePlanId
                      ? tradePlanNameMap.get(trade.tradePlanId) ?? "—"
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
