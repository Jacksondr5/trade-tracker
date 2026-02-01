"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  colorClass?: string;
  loading?: boolean;
}

function StatCard({ title, value, subtitle, colorClass, loading }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
      <h3 className="text-sm font-medium text-slate-11">{title}</h3>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-slate-700" />
      ) : (
        <p className={`mt-2 text-2xl font-bold ${colorClass || "text-slate-12"}`}>
          {value}
        </p>
      )}
      {subtitle && !loading && (
        <p className="mt-1 text-sm text-slate-11">{subtitle}</p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
      <div className="h-4 w-24 animate-pulse rounded bg-slate-700" />
      <div className="mt-2 h-8 w-32 animate-pulse rounded bg-slate-700" />
      <div className="mt-1 h-4 w-20 animate-pulse rounded bg-slate-700" />
    </div>
  );
}

export default function DashboardPage() {
  const stats = useQuery(api.analytics.getDashboardStats);
  const loading = stats === undefined;

  // Determine P&L color
  const plColorClass =
    stats && stats.totalRealizedPL >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Dashboard</h1>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Total P&L */}
          <StatCard
            title="Total P&L"
            value={
              stats.totalRealizedPL >= 0
                ? `+${formatCurrency(stats.totalRealizedPL)}`
                : formatCurrency(stats.totalRealizedPL)
            }
            subtitle={
              stats.totalRealizedPLYTD !== stats.totalRealizedPL
                ? `YTD: ${stats.totalRealizedPLYTD >= 0 ? "+" : ""}${formatCurrency(stats.totalRealizedPLYTD)}`
                : undefined
            }
            colorClass={plColorClass}
          />

          {/* Win Rate */}
          <StatCard
            title="Win Rate"
            value={stats.winRate !== null ? formatPercent(stats.winRate) : "—"}
            subtitle={
              stats.closedCampaignCount > 0
                ? `${stats.winningCampaignCount} of ${stats.closedCampaignCount} campaigns`
                : "No closed campaigns"
            }
          />

          {/* Avg Win vs Avg Loss */}
          <StatCard
            title="Avg Win vs Avg Loss"
            value={
              stats.avgWin !== null && stats.avgLoss !== null
                ? `${formatCurrency(stats.avgWin)} / ${formatCurrency(stats.avgLoss)}`
                : stats.avgWin !== null
                  ? `${formatCurrency(stats.avgWin)} / —`
                  : stats.avgLoss !== null
                    ? `— / ${formatCurrency(stats.avgLoss)}`
                    : "—"
            }
            colorClass="text-slate-12"
          />

          {/* Profit Factor */}
          <StatCard
            title="Profit Factor"
            value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—"}
            subtitle={
              stats.profitFactor !== null
                ? stats.profitFactor >= 1.5
                  ? "Good"
                  : stats.profitFactor >= 1.0
                    ? "Break-even"
                    : "Needs improvement"
                : "Insufficient data"
            }
            colorClass={
              stats.profitFactor !== null
                ? stats.profitFactor >= 1.5
                  ? "text-green-400"
                  : stats.profitFactor >= 1.0
                    ? "text-yellow-400"
                    : "text-red-400"
                : "text-slate-12"
            }
          />

          {/* Open Campaigns */}
          <StatCard
            title="Open Campaigns"
            value={stats.openCampaignCount}
            subtitle={
              stats.closedCampaignCount > 0
                ? `${stats.closedCampaignCount} closed`
                : undefined
            }
          />

          {/* Total Trades */}
          <StatCard title="Total Trades" value={stats.totalTradeCount} />
        </div>
      )}
    </div>
  );
}
