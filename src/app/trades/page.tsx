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

// Helper functions for date range calculations
function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day;
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getStartOfMonth(date: Date): Date {
  const start = new Date(date);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getStartOfYear(date: Date): Date {
  const start = new Date(date);
  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

// Format date for input[type="date"]
function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

type QuickFilter = "today" | "week" | "month" | "year" | "all";

export default function TradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trades = useQuery(api.trades.listTrades);
  const campaigns = useQuery(api.campaigns.listCampaigns);

  // Get filter values from URL params
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");
  const quickFilterParam = searchParams.get("quickFilter") as QuickFilter | null;

  // Calculate actual date range based on quick filter or custom dates
  const { startDate, endDate, activeQuickFilter } = useMemo(() => {
    const now = new Date();
    const endOfToday = getEndOfDay(now);

    // If quick filter is set, calculate dates from it
    if (quickFilterParam && quickFilterParam !== "all") {
      let start: Date;
      switch (quickFilterParam) {
        case "today":
          start = getStartOfDay(now);
          break;
        case "week":
          start = getStartOfWeek(now);
          break;
        case "month":
          start = getStartOfMonth(now);
          break;
        case "year":
          start = getStartOfYear(now);
          break;
        default:
          start = getStartOfDay(now);
      }
      return {
        activeQuickFilter: quickFilterParam,
        endDate: endOfToday.getTime(),
        startDate: start.getTime(),
      };
    }

    // If "all" is explicitly set or no params at all
    if (quickFilterParam === "all" || (!startDateParam && !endDateParam)) {
      return {
        activeQuickFilter: "all" as QuickFilter,
        endDate: null,
        startDate: null,
      };
    }

    // Custom date range from params
    const customStart = startDateParam
      ? getStartOfDay(new Date(startDateParam)).getTime()
      : null;
    const customEnd = endDateParam
      ? getEndOfDay(new Date(endDateParam)).getTime()
      : null;

    return {
      activeQuickFilter: null,
      endDate: customEnd,
      startDate: customStart,
    };
  }, [quickFilterParam, startDateParam, endDateParam]);

  // Create a lookup map for campaign names
  const campaignNameMap = useMemo(() => {
    if (!campaigns) return new Map<string, string>();
    return new Map(campaigns.map((c) => [c._id, c.name]));
  }, [campaigns]);

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

  // Update URL params
  const updateFilters = (params: {
    endDate?: string | null;
    quickFilter?: QuickFilter | null;
    startDate?: string | null;
  }) => {
    const newParams = new URLSearchParams(searchParams.toString());

    // Clear all filter params first
    newParams.delete("startDate");
    newParams.delete("endDate");
    newParams.delete("quickFilter");

    // Set new params based on what's provided
    if (params.quickFilter !== undefined) {
      if (params.quickFilter && params.quickFilter !== "all") {
        newParams.set("quickFilter", params.quickFilter);
      }
      // For "all", we don't set any params (clean URL)
    } else {
      // Custom date range
      if (params.startDate) {
        newParams.set("startDate", params.startDate);
      }
      if (params.endDate) {
        newParams.set("endDate", params.endDate);
      }
    }

    const queryString = newParams.toString();
    router.push(queryString ? `/trades?${queryString}` : "/trades");
  };

  const handleQuickFilter = (filter: QuickFilter) => {
    updateFilters({ quickFilter: filter });
  };

  const handleStartDateChange = (value: string) => {
    const currentEndDate = endDateParam ?? "";
    updateFilters({ endDate: currentEndDate || null, startDate: value || null });
  };

  const handleEndDateChange = (value: string) => {
    const currentStartDate = startDateParam ?? "";
    updateFilters({ endDate: value || null, startDate: currentStartDate || null });
  };

  // Get display values for date inputs
  const startDateInputValue = useMemo(() => {
    if (startDateParam) return startDateParam;
    if (startDate) return formatDateForInput(new Date(startDate));
    return "";
  }, [startDateParam, startDate]);

  const endDateInputValue = useMemo(() => {
    if (endDateParam) return endDateParam;
    if (endDate) return formatDateForInput(new Date(endDate));
    return "";
  }, [endDateParam, endDate]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Trades</h1>
        <Link href="/trades/new">
          <Button dataTestId="new-trade-button">New Trade</Button>
        </Link>
      </div>

      {/* Date Filter Controls */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        {/* Quick Filter Buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
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
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeQuickFilter === value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date Range Picker */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="startDate" className="text-slate-11 text-sm">
              From:
            </label>
            <input
              id="startDate"
              type="date"
              value={startDateInputValue}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="endDate" className="text-slate-11 text-sm">
              To:
            </label>
            <input
              id="endDate"
              type="date"
              value={endDateInputValue}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-12 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {(startDateParam || endDateParam) && (
            <button
              onClick={() => handleQuickFilter("all")}
              className="text-slate-11 text-sm hover:text-slate-12"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {filteredTrades === undefined ? (
        <div className="text-slate-11">Loading trades...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {trades && trades.length > 0
              ? "No trades found in the selected date range."
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
