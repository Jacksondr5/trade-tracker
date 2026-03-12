"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { STANDALONE_TRADE_PLANS_LABEL } from "~/lib/campaign-trade-plan-navigation";
import { capitalize } from "~/lib/format";

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
  const updateTradePlanStatus = useMutation(
    api.tradePlans.updateTradePlanStatus,
  );

  const [error, setError] = useState<string | null>(null);
  const [pendingCloseIds, setPendingCloseIds] = useState<Set<Id<"tradePlans">>>(
    () => new Set(),
  );
  const [closeErrors, setCloseErrors] = useState<
    Map<Id<"tradePlans">, string>
  >(() => new Map());

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
        setError(
          err instanceof Error ? err.message : "Failed to create trade plan",
        );
      }
    },
  });

  const handleClosePlan = async (tradePlanId: Id<"tradePlans">) => {
    setCloseErrors((current) => {
      const next = new Map(current);
      next.delete(tradePlanId);
      return next;
    });
    setPendingCloseIds((current) => {
      const next = new Set(current);
      next.add(tradePlanId);
      return next;
    });

    try {
      await updateTradePlanStatus({
        status: "closed",
        tradePlanId,
      });
    } catch (err) {
      setCloseErrors((current) => {
        const next = new Map(current);
        next.set(
          tradePlanId,
          err instanceof Error ? err.message : "Failed to close trade plan",
        );
        return next;
      });
    } finally {
      setPendingCloseIds((current) => {
        const next = new Set(current);
        next.delete(tradePlanId);
        return next;
      });
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold text-olive-12">Trade Plans</h1>
        <p className="max-w-2xl text-sm text-olive-11">
          Create standalone trade plans here, then move through linked plans
          from the shared campaign hierarchy.
        </p>
      </div>

      <Card className="mb-8 border-olive-6 bg-olive-2">
        <CardHeader className="px-4 pt-4">
          <CardTitle>Create Trade Plan</CardTitle>
          <p className="text-sm text-olive-11">
            New trade plans created here start as standalone trade plans.
          </p>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          {error && (
            <Alert
              variant="error"
              className="mb-3"
              onDismiss={() => setError(null)}
            >
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
                <field.FieldInput label="Plan name" placeholder="Plan name" />
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
        </CardContent>
      </Card>

      <Card className="border-olive-6 bg-olive-2">
        <CardHeader className="px-4 pt-4">
          <CardTitle>{STANDALONE_TRADE_PLANS_LABEL}</CardTitle>
          <p className="text-sm text-olive-11">
            {linkedPlanCount === 0
              ? "Linked trade plans appear within campaigns and the hierarchy."
              : linkedPlanCount === 1
                ? "1 linked trade plan currently appears within its campaign and the hierarchy."
                : `${linkedPlanCount} linked trade plans currently appear within their campaigns and the hierarchy.`}
          </p>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          {standalonePlans.length === 0 ? (
            <div className="rounded-lg border border-olive-6 bg-olive-3/50 px-4 py-4">
              <p className="text-sm font-medium text-olive-12">
                No standalone trade plans yet
              </p>
              <p className="mt-1 text-sm text-olive-11">
                Create one here or add a linked trade plan from a campaign.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {standalonePlans.map((plan) => (
                <div
                  key={plan._id}
                  className="rounded-lg border border-olive-6 bg-olive-3/50 p-3 transition-colors hover:border-olive-7 hover:bg-olive-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/trade-plans/${plan._id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="font-semibold text-olive-12">{plan.name}</p>
                      <p className="text-sm text-olive-11">
                        {plan.instrumentSymbol}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{capitalize(plan.status)}</Badge>
                      {plan.status !== "closed" && (
                        <Button
                          dataTestId={`close-plan-${plan._id}`}
                          variant="secondary"
                          className="border border-olive-6 bg-olive-3 text-olive-12 hover:bg-olive-4"
                          onClick={() => {
                            void handleClosePlan(plan._id);
                          }}
                          disabled={pendingCloseIds.has(plan._id)}
                        >
                          {pendingCloseIds.has(plan._id) ? "Closing..." : "Close"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {closeErrors.has(plan._id) ? (
                    <Alert variant="error" className="mt-3">
                      {closeErrors.get(plan._id)}
                    </Alert>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
