"use client";

import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
  const { isLoaded, isSignedIn } = useAuth();
  const [migrationState, setMigrationState] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [migrationMessage, setMigrationMessage] = useState<string>("");
  const stats = useQuery(
    api.analytics.getDashboardStats,
    isSignedIn ? {} : "skip",
  );
  const ownerTokenIdentifier = useQuery(
    api.debug.getOwnerTokenIdentifier,
    isSignedIn ? {} : "skip",
  );
  const runSingleUserBackfill = useMutation(api.debug.backfillAllDataToCurrentUser);
  const loading = stats === undefined;

  const handleRunBackfill = async () => {
    setMigrationState("running");
    setMigrationMessage("");

    try {
      const result = await runSingleUserBackfill({});
      setMigrationState("success");
      setMigrationMessage(
        `Updated ${result.campaignsUpdated} campaigns, ${result.tradePlansUpdated} trade plans, ${result.tradesUpdated} trades, ${result.campaignNotesUpdated} notes, ${result.portfolioSnapshotsUpdated} snapshots.`,
      );
    } catch (error) {
      setMigrationState("error");
      setMigrationMessage(
        error instanceof Error ? error.message : "Migration failed.",
      );
    }
  };

  if (!isLoaded) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-slate-12 mb-6 text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <h1 className="text-slate-12 text-2xl font-bold">Sign in to view your dashboard</h1>
          <p className="mt-3 text-slate-11">
            Your trades, campaigns, and analytics are now isolated per user account.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <SignInButton mode="modal">
              <button className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700">
                Create account
              </button>
            </SignUpButton>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="mt-6 rounded-lg border border-amber-700 bg-amber-950/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
          Temporary migration helper
        </p>
        <p className="mt-2 text-sm text-amber-100">
          Owner token identifier:
          <code className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs text-amber-200">
            {ownerTokenIdentifier ?? "Loading..."}
          </code>
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleRunBackfill}
            disabled={
              migrationState === "running" || ownerTokenIdentifier === undefined
            }
            className="rounded-md bg-amber-400 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {migrationState === "running"
              ? "Running migration..."
              : "Assign owner ID to all data"}
          </button>
          {migrationMessage && (
            <p
              className={`mt-2 text-sm ${
                migrationState === "error" ? "text-red-300" : "text-amber-100"
              }`}
            >
              {migrationMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
