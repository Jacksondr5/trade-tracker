"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { Check, CheckCircle2, Loader2, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";

type SaveState = "idle" | "saving" | "saved";

export default function PortfolioDetailPageClient({
  portfolioId,
  preloadedPortfolioDetail,
}: {
  portfolioId: Id<"portfolios">;
  preloadedPortfolioDetail: Preloaded<
    typeof api.portfolios.getPortfolioDetail
  >;
}) {
  const router = useRouter();
  const detail = usePreloadedQuery(preloadedPortfolioDetail);

  const updatePortfolio = useMutation(api.portfolios.updatePortfolio);
  const deletePortfolio = useMutation(api.portfolios.deletePortfolio);

  const [portfolioName, setPortfolioName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaveState, setNameSaveState] = useState<SaveState>("idle");

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (detail && !nameInitialized) {
      setPortfolioName(detail.portfolio.name);
      setNameInitialized(true);
    }
  }, [detail, nameInitialized]);

  const handleSaveName = async () => {
    setNameError(null);
    setNameSaveState("saving");

    const trimmedName = portfolioName.trim();

    try {
      await updatePortfolio({
        portfolioId,
        name: trimmedName,
      });
      setPortfolioName(trimmedName);
      setNameSaveState("saved");
    } catch (error) {
      setNameError(
        error instanceof ConvexError
          ? typeof error.data === "string"
            ? error.data
            : "Failed to save portfolio name"
          : error instanceof Error
            ? error.message
            : "Failed to save portfolio name",
      );
      setNameSaveState("idle");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deletePortfolio({ portfolioId });
      router.push("/portfolio");
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Failed to delete portfolio",
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (detail === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-slate-11">Portfolio not found.</p>
        <Link
          href="/portfolio"
          className="mt-4 inline-block text-blue-400 hover:underline"
        >
          Back to portfolios
        </Link>
      </div>
    );
  }

  const { trades, campaigns } = detail;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/portfolio"
        className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12"
      >
        &larr; Back to Portfolios
      </Link>

      {/* Header section */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div>
          <label
            htmlFor="portfolio-name"
            className="mb-1 block text-xs uppercase tracking-wide text-slate-11"
          >
            Portfolio Name
          </label>
            <div className="flex items-center gap-2">
              <input
                id="portfolio-name"
                maxLength={120}
                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-xl font-bold text-slate-12"
                value={portfolioName}
                onChange={(e) => {
                  setPortfolioName(e.target.value);
                  setNameError(null);
                  if (nameSaveState === "saved") {
                    setNameSaveState("idle");
                  }
                }}
              />
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-blue-700 text-blue-400 hover:bg-blue-900/50 hover:text-blue-300 disabled:opacity-50"
                onClick={() => void handleSaveName()}
                disabled={nameSaveState === "saving"}
                title="Save name"
                aria-label="Save name"
              >
                {nameSaveState === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : nameSaveState === "saved" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </button>
              {showDeleteConfirm ? (
                <>
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-red-700 text-red-400 hover:bg-red-900/50 disabled:opacity-50"
                    onClick={() => void handleDelete()}
                    disabled={isDeleting}
                    title="Confirm delete"
                    aria-label="Confirm delete"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-600 text-slate-11 hover:bg-slate-600 hover:text-slate-12"
                    onClick={() => setShowDeleteConfirm(false)}
                    title="Cancel delete"
                    aria-label="Cancel delete"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-red-700 text-red-400 hover:bg-red-900/50 hover:text-red-300"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete portfolio"
                  aria-label="Delete portfolio"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          {nameError && (
            <p className="mt-2 text-sm text-red-300">{nameError}</p>
          )}
        </div>
      </div>

      {/* Trades section */}
      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trades</h2>
          <span className="text-sm text-slate-11">
            {trades.length} trade{trades.length !== 1 ? "s" : ""}
          </span>
        </div>

        {trades.length === 0 ? (
          <p className="text-sm text-slate-11">
            No trades in this portfolio yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Direction</th>
                  <th className="px-2 py-2 text-right">Price</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade._id}
                    className="border-b border-slate-700/60"
                  >
                    <td className="px-2 py-2 text-slate-11">
                      {formatDate(trade.date)}
                    </td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.direction}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-11">
                      {formatCurrency(trade.price)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-11">
                      {trade.quantity}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {trade.realizedPL === null ? (
                        <span className="text-slate-11">&mdash;</span>
                      ) : (
                        <span
                          className={
                            trade.realizedPL >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {trade.realizedPL >= 0 ? "+" : ""}
                          {formatCurrency(trade.realizedPL)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Campaigns section */}
      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">
          Campaigns
        </h2>

        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-11">
            No campaigns linked through trades yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Trade Count</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign._id}
                    className="border-b border-slate-700/60 hover:bg-slate-700/30"
                  >
                    <td className="px-2 py-2">
                      <Link
                        href={`/campaigns/${campaign._id}`}
                        className="text-blue-400 hover:underline"
                      >
                        {campaign.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-slate-11">
                      {campaign.status.charAt(0).toUpperCase() +
                        campaign.status.slice(1)}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-11">
                      {campaign.tradeCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
