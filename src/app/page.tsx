"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

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

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-700 bg-slate-800 p-6">
      <div className="mb-2 h-4 w-24 rounded bg-slate-700" />
      <div className="h-8 w-32 rounded bg-slate-700" />
    </div>
  );
}

interface StatCardProps {
  label: string;
  subtitle?: string;
  value: string;
  valueColor?: string;
}

function StatCard({ label, subtitle, value, valueColor = "text-slate-12" }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
      <div className="text-slate-11 text-sm font-medium">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</div>
      {subtitle && <div className="text-slate-11 mt-1 text-sm">{subtitle}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const stats = useQuery(api.analytics.getDashboardStats);

  // Show loading skeletons while fetching
  if (stats === undefined) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-slate-12 mb-6 text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Determine P&L color
  const plColor =
    stats.totalRealizedPL > 0
      ? "text-green-400"
      : stats.totalRealizedPL < 0
        ? "text-red-400"
        : "text-slate-12";

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total P&L */}
        <StatCard
          label="Total P&L"
          subtitle={`YTD: ${formatPL(stats.totalRealizedPLYTD)}`}
          value={formatPL(stats.totalRealizedPL)}
          valueColor={plColor}
        />

        {/* Win Rate */}
        <StatCard
          label="Win Rate"
          subtitle={`${stats.winningCampaignCount} of ${stats.closedCampaignCount} campaigns`}
          value={stats.winRate !== null ? `${stats.winRate.toFixed(1)}%` : "—"}
        />

        {/* Avg Win vs Avg Loss */}
        <StatCard
          label="Avg Win vs Avg Loss"
          value={
            stats.avgWin !== null && stats.avgLoss !== null
              ? `${formatCurrency(stats.avgWin)} / ${formatCurrency(Math.abs(stats.avgLoss))}`
              : stats.avgWin !== null
                ? `${formatCurrency(stats.avgWin)} / —`
                : stats.avgLoss !== null
                  ? `— / ${formatCurrency(Math.abs(stats.avgLoss))}`
                  : "—"
          }
        />

        {/* Profit Factor */}
        <StatCard
          label="Profit Factor"
          subtitle="Total gains / Total losses"
          value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—"}
          valueColor={
            stats.profitFactor !== null && stats.profitFactor >= 1
              ? "text-green-400"
              : stats.profitFactor !== null
                ? "text-red-400"
                : "text-slate-12"
          }
        />

        {/* Open Campaigns */}
        <StatCard
          label="Open Campaigns"
          subtitle="Planning + Active"
          value={stats.openCampaignCount.toString()}
        />

        {/* Total Trades */}
        <StatCard
          label="Total Trades"
          value={stats.totalTradeCount.toString()}
        />
      </div>
    </div>
  );
}
