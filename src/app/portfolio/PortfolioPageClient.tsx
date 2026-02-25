"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";

export default function PortfolioPageClient({
  preloadedPortfolios,
}: {
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
}) {
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const createPortfolio = useMutation(api.portfolios.createPortfolio);

  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsCreating(true);
    setErrorMessage(null);

    try {
      await createPortfolio({ name: newName.trim() });
      setNewName("");
    } catch (error) {
      setErrorMessage(
        error instanceof ConvexError
          ? typeof error.data === "string"
            ? error.data
            : "Failed to create portfolio"
          : error instanceof Error
            ? error.message
            : "Failed to create portfolio",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-slate-12 text-2xl font-bold">Portfolios</h1>
        </div>

      {/* Inline create form */}
      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="new-portfolio-name"
              className="mb-1 block text-sm text-slate-11"
            >
              New Portfolio
            </label>
            <input
              id="new-portfolio-name"
              type="text"
              maxLength={120}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Portfolio name"
              className="text-slate-12 h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <Button
            type="submit"
            disabled={isCreating || !newName.trim()}
            dataTestId="create-portfolio-button"
          >
            {isCreating ? "Creating..." : "Create"}
          </Button>
        </form>
        {errorMessage && (
          <p className="mt-2 text-sm text-red-300">{errorMessage}</p>
        )}
      </div>

      {portfolios.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">No portfolios yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full table-auto">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                  Name
                </th>
                <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                  Trade Count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900">
              {portfolios.map((portfolio) => (
                <tr key={portfolio._id} className="hover:bg-slate-800/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    <Link
                      href={`/portfolio/${portfolio._id}`}
                      className="text-slate-12 hover:underline"
                      aria-label={`View portfolio ${portfolio.name}`}
                    >
                      {portfolio.name}
                    </Link>
                  </td>
                  <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-right text-sm">
                    {portfolio.tradeCount}
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
