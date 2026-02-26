"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

export default function TradePlansPageClient({
  preloadedTradePlans,
}: {
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listTradePlans>;
}) {
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);

  const [name, setName] = useState("");
  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const standalonePlans = tradePlans.filter((plan) => !plan.campaignId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !instrumentSymbol.trim()) {
      setError("Name and instrument symbol are required");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await createTradePlan({
        instrumentSymbol: instrumentSymbol.trim().toUpperCase(),
        name: name.trim(),
      });

      setName("");
      setInstrumentSymbol("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trade plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosePlan = async (tradePlanId: Id<"tradePlans">) => {
    try {
      await updateTradePlanStatus({
        status: "closed",
        tradePlanId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close trade plan");
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-12">Trade Plans</h1>

      <section className="mb-8 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-12">Create Standalone Plan</h2>
        {error && (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        )}

        <form className="grid gap-3" onSubmit={handleCreate}>
          <input
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Plan name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Instrument symbol (e.g. CPER)"
            value={instrumentSymbol}
            onChange={(e) => setInstrumentSymbol(e.target.value)}
          />

          <div>
            <Button
              dataTestId="create-trade-plan-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Trade Plan"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-12">Standalone Plans</h2>
        {standalonePlans.length === 0 ? (
          <p className="text-slate-11">No standalone trade plans yet.</p>
        ) : (
          <div className="space-y-3">
            {standalonePlans.map((plan) => (
              <div key={plan._id} className="rounded border border-slate-600 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/trade-plans/${plan._id}`}
                      className="font-semibold text-slate-12 hover:text-blue-400 hover:underline"
                    >
                      {plan.name}
                    </Link>
                    <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{plan.status}</Badge>
                    {plan.status !== "closed" && (
                      <Button
                        dataTestId={`close-plan-${plan._id}`}
                        variant="secondary"
                        onClick={() => void handleClosePlan(plan._id)}
                      >
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
