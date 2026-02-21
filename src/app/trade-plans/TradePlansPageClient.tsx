"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useState } from "react";
import { Button } from "~/components/ui";
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
  const [entryConditions, setEntryConditions] = useState("");
  const [exitConditions, setExitConditions] = useState("");
  const [targetConditions, setTargetConditions] = useState("");
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
        entryConditions: entryConditions.trim() || "Waiting for setup confirmation",
        exitConditions: exitConditions.trim() || "Invalidation or thesis deterioration",
        instrumentSymbol: instrumentSymbol.trim().toUpperCase(),
        name: name.trim(),
        targetConditions: targetConditions.trim() || "Take profit on thesis completion",
      });

      setName("");
      setInstrumentSymbol("");
      setEntryConditions("");
      setExitConditions("");
      setTargetConditions("");
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
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

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
          <textarea
            className="min-h-24 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Entry conditions"
            value={entryConditions}
            onChange={(e) => setEntryConditions(e.target.value)}
          />
          <textarea
            className="min-h-24 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Exit conditions"
            value={exitConditions}
            onChange={(e) => setExitConditions(e.target.value)}
          />
          <textarea
            className="min-h-24 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
            placeholder="Target conditions"
            value={targetConditions}
            onChange={(e) => setTargetConditions(e.target.value)}
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
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-12">{plan.name}</p>
                    <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-11">
                      {plan.status}
                    </span>
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
                <p className="text-sm text-slate-11">
                  <strong>Entry:</strong> {plan.entryConditions}
                </p>
                <p className="text-sm text-slate-11">
                  <strong>Exit:</strong> {plan.exitConditions}
                </p>
                <p className="text-sm text-slate-11">
                  <strong>Targets:</strong> {plan.targetConditions}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
