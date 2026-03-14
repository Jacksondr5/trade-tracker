"use client";

import { useQuery } from "convex/react";
import { api } from "~/convex/_generated/api";
import { APP_PAGE_TITLES } from "../../../../shared/e2e/testIds";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  colorClass?: string;
  loading?: boolean;
}

function StatCard({
  title,
  value,
  subtitle,
  colorClass,
  loading,
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
      <h3 className="text-sm font-medium text-slate-11">{title}</h3>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-slate-700" />
      ) : (
        <p
          className={`mt-2 text-2xl font-bold ${colorClass || "text-slate-12"}`}
        >
          {value}
        </p>
      )}
      {subtitle && !loading ? (
        <p className="mt-1 text-sm text-slate-11">{subtitle}</p>
      ) : null}
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
  const stats = useQuery(api.analytics.getDashboardStats, {});
  const loading = stats === undefined;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1
        className="mb-6 text-2xl font-bold text-slate-12"
        data-testid={APP_PAGE_TITLES.dashboard}
      >
        Dashboard
      </h1>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Open Campaigns"
            value={stats.openCampaignCount}
            subtitle={
              stats.closedCampaignCount > 0
                ? `${stats.closedCampaignCount} closed`
                : undefined
            }
          />
          <StatCard
            title="Closed Campaigns"
            value={stats.closedCampaignCount}
          />
          <StatCard title="Total Trades" value={stats.totalTradeCount} />
        </div>
      )}
    </div>
  );
}
