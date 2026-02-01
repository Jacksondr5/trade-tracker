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

function getDefaultDate(): string {
  const now = new Date();
  // Format: YYYY-MM-DD for date input
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PortfolioPage() {
  const snapshots = useQuery(api.portfolioSnapshots.listSnapshots);
  const createSnapshot = useMutation(api.portfolioSnapshots.createSnapshot);

  // Form state
  const [date, setDate] = useState(getDefaultDate());
  const [totalValue, setTotalValue] = useState("");
  const [cashBalance, setCashBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate total value
    const parsedTotalValue = parseFloat(totalValue);
    if (isNaN(parsedTotalValue) || parsedTotalValue < 0) {
      setErrorMessage("Please enter a valid total value");
      return;
    }

    // Validate optional cash balance
    let parsedCashBalance: number | undefined;
    if (cashBalance.trim()) {
      parsedCashBalance = parseFloat(cashBalance);
      if (isNaN(parsedCashBalance) || parsedCashBalance < 0) {
        setErrorMessage("Please enter a valid cash balance");
        return;
      }
    }

    // Convert date string to timestamp (start of day)
    const dateTimestamp = new Date(date).getTime();

    setIsSubmitting(true);

    try {
      await createSnapshot({
        cashBalance: parsedCashBalance,
        date: dateTimestamp,
        totalValue: parsedTotalValue,
      });

      // Clear form on success
      setDate(getDefaultDate());
      setTotalValue("");
      setCashBalance("");
      setSuccessMessage("Snapshot saved successfully!");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save snapshot"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">Portfolio</h1>

      {/* Add snapshot form */}
      <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">
          Add Snapshot
        </h2>

        {successMessage && (
          <div className="mb-4 flex items-center justify-between rounded border border-green-700 bg-green-900/50 px-4 py-2 text-green-200">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-green-300 hover:text-green-100"
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
              className="text-red-300 hover:text-red-100"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="date"
                className="text-slate-11 mb-1 block text-sm"
              >
                Date <span className="text-red-400">*</span>
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-slate-12 placeholder:text-slate-11 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="totalValue"
                className="text-slate-11 mb-1 block text-sm"
              >
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
                className="text-slate-12 placeholder:text-slate-11 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="cashBalance"
                className="text-slate-11 mb-1 block text-sm"
              >
                Cash Balance (optional)
              </label>
              <input
                id="cashBalance"
                type="number"
                step="0.01"
                min="0"
                value={cashBalance}
                onChange={(e) => setCashBalance(e.target.value)}
                placeholder="e.g., 5000.00"
                className="text-slate-12 placeholder:text-slate-11 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !totalValue.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Snapshot"}
          </button>
        </form>
      </div>

      {/* Historical snapshots table */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">History</h2>

        {snapshots === undefined ? (
          <p className="text-slate-11 text-sm">Loading snapshots...</p>
        ) : snapshots.length === 0 ? (
          <p className="text-slate-11 text-sm">
            No snapshots yet. Add your first snapshot above.
          </p>
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
                    className="text-slate-12 text-sm hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(snapshot.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatCurrency(snapshot.totalValue)}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-right">
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
