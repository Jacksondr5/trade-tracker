"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatPL(value: number): { text: string; colorClass: string } {
  const prefix = value >= 0 ? "+" : "";
  const text = prefix + formatCurrency(value);
  const colorClass =
    value > 0
      ? "text-green-400"
      : value < 0
        ? "text-red-400"
        : "text-slate-11";
  return { text, colorClass };
}

function StatCard({
  title,
  value,
  subtitle,
  colorClass,
  isLoading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  colorClass?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <div className="bg-slate-700 mb-2 h-4 w-24 animate-pulse rounded" />
        <div className="bg-slate-600 h-8 w-32 animate-pulse rounded" />
        {subtitle !== undefined && (
          <div className="bg-slate-700 mt-2 h-3 w-20 animate-pulse rounded" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
      <div className="text-slate-11 mb-2 text-sm font-medium">{title}</div>
      <div className={`text-2xl font-bold ${colorClass ?? "text-slate-12"}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-slate-11 mt-2 text-xs">{subtitle}</div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const stats = useQuery(api.analytics.getDashboardStats);
  const isLoading = stats === undefined;

  // Format values for display
  const totalPL = stats ? formatPL(stats.totalRealizedPL) : null;
  const ytdPL = stats ? formatPL(stats.totalRealizedPLYTD) : null;
  const avgWin = stats?.avgWin ? formatPL(stats.avgWin) : null;
  const avgLoss = stats?.avgLoss ? formatPL(stats.avgLoss) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-slate-12 text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-11 mt-1">
          Your trading performance at a glance
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total P&L */}
        <StatCard
          title="Total P&L"
          value={totalPL?.text ?? "$0.00"}
          subtitle={ytdPL ? `YTD: ${ytdPL.text}` : undefined}
          colorClass={totalPL?.colorClass}
          isLoading={isLoading}
        />

        {/* Win Rate */}
        <StatCard
          title="Win Rate"
          value={
            stats?.winRate !== null && stats?.winRate !== undefined
              ? `${stats.winRate.toFixed(1)}%`
              : "—"
          }
          subtitle={
            stats
              ? `${stats.winningCampaignCount} of ${stats.closedCampaignCount} campaigns`
              : undefined
          }
          isLoading={isLoading}
        />

        {/* Avg Win vs Avg Loss */}
        <StatCard
          title="Avg Win vs Avg Loss"
          value={
            avgWin && avgLoss
              ? `${avgWin.text} / ${avgLoss.text}`
              : avgWin
                ? avgWin.text
                : avgLoss
                  ? avgLoss.text
                  : "—"
          }
          isLoading={isLoading}
        />

        {/* Profit Factor */}
        <StatCard
          title="Profit Factor"
          value={
            stats?.profitFactor !== null && stats?.profitFactor !== undefined
              ? stats.profitFactor.toFixed(2)
              : "—"
          }
          subtitle="Total gains / total losses"
          isLoading={isLoading}
        />

        {/* Open Campaigns */}
        <StatCard
          title="Open Campaigns"
          value={stats?.openCampaignCount?.toString() ?? "0"}
          subtitle="Planning + Active"
          isLoading={isLoading}
        />

        {/* Total Trades */}
        <StatCard
          title="Total Trades"
          value={stats?.totalTradeCount?.toString() ?? "0"}
          subtitle="All time"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
