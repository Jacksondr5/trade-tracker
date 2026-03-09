"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { Alert, Badge, Button, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { STANDALONE_TRADE_PLANS_LABEL } from "~/lib/campaign-trade-plan-navigation";

const createTradePlanSchema = z.object({
  instrumentSymbol: z.string().trim().min(1, "Instrument symbol is required"),
  name: z.string().trim().min(1, "Plan name is required"),
});

export default function TradePlansPageClient({
  preloadedTradePlans,
}: {
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listTradePlans>;
}) {
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);

  const [error, setError] = useState<string | null>(null);

  const standalonePlans = tradePlans.filter((plan) => !plan.campaignId);
  const linkedPlanCount = tradePlans.length - standalonePlans.length;

  const form = useAppForm({
    defaultValues: {
      instrumentSymbol: "",
      name: "",
    },
    validators: {
      onChange: ({ value }) => {
        const result = createTradePlanSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      try {
        const parsed = createTradePlanSchema.parse(value);
        await createTradePlan({
          instrumentSymbol: parsed.instrumentSymbol.toUpperCase(),
          name: parsed.name,
        });
        formApi.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create trade plan");
      }
    },
  });

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
        <h2 className="text-lg font-semibold text-slate-12">Create Trade Plan</h2>
        <p className="mb-4 mt-1 text-sm text-slate-11">
          New trade plans created here start as standalone trade plans.
        </p>
        {error && (
          <Alert variant="error" className="mb-3" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="name">
            {(field) => (
              <field.FieldInput
                label="Plan name"
                placeholder="Plan name"
              />
            )}
          </form.AppField>
          <form.AppField name="instrumentSymbol">
            {(field) => (
              <field.FieldInput
                label="Instrument symbol"
                placeholder="Instrument symbol (e.g. CPER)"
              />
            )}
          </form.AppField>

          <div>
            <form.AppForm>
              <form.SubmitButton
                dataTestId="create-trade-plan-button"
                label="Create Trade Plan"
              />
            </form.AppForm>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="text-lg font-semibold text-slate-12">
          {STANDALONE_TRADE_PLANS_LABEL}
        </h2>
        <p className="mb-4 mt-1 text-sm text-slate-11">
          {linkedPlanCount === 0
            ? "Linked trade plans appear within campaigns and the hierarchy."
            : linkedPlanCount === 1
              ? "1 linked trade plan currently appears within its campaign and the hierarchy."
              : `${linkedPlanCount} linked trade plans currently appear within their campaigns and the hierarchy.`}
        </p>
        {standalonePlans.length === 0 ? (
          <p className="text-slate-11">
            No standalone trade plans yet. Create one here or add a linked trade
            plan from a campaign.
          </p>
        ) : (
          <div className="space-y-3">
            {standalonePlans.map((plan) => (
              <div
                key={plan._id}
                className="rounded border border-slate-600 p-3 hover:border-slate-500"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/trade-plans/${plan._id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="font-semibold text-slate-12">{plan.name}</p>
                    <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{plan.status}</Badge>
                    {plan.status !== "closed" && (
                      <Button
                        dataTestId={`close-plan-${plan._id}`}
                        variant="secondary"
                        onClick={() => {
                          void handleClosePlan(plan._id);
                        }}
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
