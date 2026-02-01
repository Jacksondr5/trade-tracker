"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD date string as local time (not UTC).
 * This avoids timezone issues where new Date("2026-01-15") might return Jan 14 or 15
 * depending on the user's timezone.
 */
function parseDateInputLocal(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function PortfolioPage() {
  const snapshots = useQuery(api.portfolioSnapshots.listSnapshots);
  const createSnapshot = useMutation(api.portfolioSnapshots.createSnapshot);

  // Form state
  const [date, setDate] = useState(getTodayDateString());
  const [totalValue, setTotalValue] = useState("");
  const [cashBalance, setCashBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!date.trim()) {
      setErrorMessage("Date is required");
      return;
    }

    if (!totalValue.trim()) {
      setErrorMessage("Total value is required");
      return;
    }

    const parsedTotalValue = parseFloat(totalValue);
    if (isNaN(parsedTotalValue) || parsedTotalValue < 0) {
      setErrorMessage("Total value must be a non-negative number");
      return;
    }

    const parsedCashBalance = cashBalance.trim()
      ? parseFloat(cashBalance)
      : undefined;
    if (parsedCashBalance !== undefined && (isNaN(parsedCashBalance) || parsedCashBalance < 0)) {
      setErrorMessage("Cash balance must be a non-negative number");
      return;
    }

    setIsSubmitting(true);

    try {
      await createSnapshot({
        cashBalance: parsedCashBalance,
        date: parseDateInputLocal(date).getTime(),
        totalValue: parsedTotalValue,
      });

      setSuccessMessage("Snapshot recorded successfully!");
      // Reset form
      setDate(getTodayDateString());
      setTotalValue("");
      setCashBalance("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create snapshot"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Portfolio Snapshots</h1>

      {/* Add snapshot form */}
      <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">Record Snapshot</h2>

        {successMessage && (
          <div className="mb-4 flex items-center justify-between rounded border border-green-700 bg-green-900/50 px-4 py-2 text-green-200">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-4 text-green-300 hover:text-green-100"
              aria-label="Dismiss success message"
            >
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 flex items-center justify-between rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-200">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="ml-4 text-red-300 hover:text-red-100"
              aria-label="Dismiss error message"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="date" className="mb-1 block text-sm text-slate-11">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="totalValue" className="mb-1 block text-sm text-slate-11">
                Total Value <span className="text-red-400">*</span>
              </label>
              <input
                id="totalValue"
                type="number"
                step="0.01"
                min="0"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="e.g., 50000.00"
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cashBalance" className="mb-1 block text-sm text-slate-11">
                Cash Balance (optional)
              </label>
              <input
                id="cashBalance"
                type="number"
                step="0.01"
                min="0"
                value={cashBalance}
                onChange={(e) => setCashBalance(e.target.value)}
                placeholder="e.g., 10000.00"
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-12 placeholder:text-slate-11 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Recording..." : "Record Snapshot"}
          </button>
        </form>
      </div>

      {/* Snapshots history */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">History</h2>

        {snapshots === undefined ? (
          <p className="text-slate-11">Loading snapshots...</p>
        ) : snapshots.length === 0 ? (
          <p className="text-slate-11">No snapshots recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50 text-left text-sm text-slate-11">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total Value</th>
                  <th className="px-4 py-3 text-right">Cash Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {snapshots.map((snapshot) => (
                  <tr
                    key={snapshot._id}
                    className="text-sm text-slate-12 hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(snapshot.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {formatCurrency(snapshot.totalValue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-11">
                      {snapshot.cashBalance !== undefined
                        ? formatCurrency(snapshot.cashBalance)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
