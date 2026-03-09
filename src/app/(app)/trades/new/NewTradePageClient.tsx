"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import {
  Alert,
  Button,
  Card,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

const tradeSchema = z.object({
  assetType: z.enum(["stock", "crypto"]),
  date: z.string().min(1, "Date is required"),
  direction: z.enum(["long", "short"]),
  notes: z.string().optional(),
  portfolioId: z.string().optional(),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((value) => Number.isFinite(parseFloat(value.trim())), "Price must be a valid number"),
  quantity: z
    .string()
    .min(1, "Quantity is required")
    .refine((value) => Number.isFinite(parseFloat(value.trim())), "Quantity must be a valid number"),
  side: z.enum(["buy", "sell"]),
  ticker: z.string().min(1, "Ticker is required"),
  tradePlanId: z.string().optional(),
});

type TradeFormData = z.infer<typeof tradeSchema>;

function getDefaultDateTime(): string {
  const now = new Date();
  // Format: YYYY-MM-DDTHH:mm for datetime-local input
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function NewTradePageClient({
  preloadedOpenTradePlans,
  preloadedPortfolios,
}: {
  preloadedOpenTradePlans: Preloaded<typeof api.tradePlans.listOpenTradePlans>;
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTradePlanId = searchParams.get("tradePlanId") || "";
  const createTrade = useMutation(api.trades.createTrade);
  const openTradePlans = usePreloadedQuery(preloadedOpenTradePlans);
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      assetType: "stock" as "stock" | "crypto",
      date: getDefaultDateTime(),
      direction: "long" as "long" | "short",
      notes: "",
      portfolioId: "",
      price: "",
      quantity: "",
      side: "buy" as "buy" | "sell",
      ticker: "",
      tradePlanId: preselectedTradePlanId,
    } satisfies TradeFormData,
    validators: {
      onChange: ({ value }) => {
        const results = tradeSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      try {
        const parsed = tradeSchema.parse(value);
        await createTrade({
          assetType: parsed.assetType,
          date: new Date(parsed.date).getTime(),
          direction: parsed.direction,
          notes: parsed.notes || undefined,
          portfolioId: parsed.portfolioId
            ? (parsed.portfolioId as Id<"portfolios">)
            : undefined,
          price: parseFloat(parsed.price.trim()),
          quantity: parseFloat(parsed.quantity.trim()),
          side: parsed.side,
          ticker: parsed.ticker.toUpperCase(),
          tradePlanId: parsed.tradePlanId
            ? (parsed.tradePlanId as Id<"tradePlans">)
            : undefined,
        });
        setSuccessMessage("Trade created successfully!");
        setTimeout(() => {
          router.push("/trades");
        }, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create trade";
        setErrorMessage(message);
      }
    },
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">New Trade</h1>

      {successMessage && (
        <Alert variant="success" className="mb-4">
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="error" className="mb-4" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <Card className="bg-slate-800 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="flex flex-col gap-6">
            <form.AppField name="date">
              {(field) => (
                <field.FieldInput label="Date & Time" type="datetime-local" />
              )}
            </form.AppField>

            <form.AppField name="ticker">
              {(field) => (
                <field.FieldInput label="Ticker" placeholder="e.g. AAPL" />
              )}
            </form.AppField>

            <form.AppField name="tradePlanId">
              {(field) => (
                <field.FieldSelect
                  label="Trade Plan (optional)"
                  placeholder="No trade plan"
                  options={openTradePlans.map((tradePlan) => ({
                    label: `${tradePlan.name} (${tradePlan.instrumentSymbol}) [${tradePlan.status}]`,
                    value: tradePlan._id,
                  }))}
                />
              )}
            </form.AppField>

            <form.AppField name="portfolioId">
              {(field) => (
                <field.FieldSelect
                  label="Portfolio (optional)"
                  placeholder="No portfolio"
                  options={portfolios.map((portfolio) => ({
                    label: portfolio.name,
                    value: portfolio._id,
                  }))}
                />
              )}
            </form.AppField>

            <div className="grid grid-cols-3 gap-6">
              <form.AppField name="assetType">
                {(field) => (
                  <field.FieldSelect
                    label="Asset Type"
                    options={[
                      { label: "Stock", value: "stock" },
                      { label: "Crypto", value: "crypto" },
                    ]}
                  />
                )}
              </form.AppField>

              <form.AppField name="side">
                {(field) => (
                  <field.FieldSelect
                    label="Side"
                    options={[
                      { label: "Buy", value: "buy" },
                      { label: "Sell", value: "sell" },
                    ]}
                  />
                )}
              </form.AppField>

              <form.AppField name="direction">
                {(field) => (
                  <field.FieldSelect
                    label="Direction"
                    options={[
                      { label: "Long", value: "long" },
                      { label: "Short", value: "short" },
                    ]}
                  />
                )}
              </form.AppField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.AppField name="price">
                {(field) => (
                  <field.FieldInput
                    label="Price"
                    type="number"
                    placeholder="0.00"
                  />
                )}
              </form.AppField>

              <form.AppField name="quantity">
                {(field) => (
                  <field.FieldInput
                    label="Quantity"
                    type="number"
                    placeholder="0"
                  />
                )}
              </form.AppField>
            </div>

            <form.AppField name="notes">
              {(field) => (
                <field.FieldTextarea
                  label="Notes (optional)"
                  placeholder="Add any notes about this trade..."
                  rows={3}
                />
              )}
            </form.AppField>

            <div className="flex justify-end gap-3 pt-4">
              <form.AppForm>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => router.push("/trades")}
                      dataTestId="cancel-button"
                    >
                      Cancel
                    </Button>
                  )}
                </form.Subscribe>
                <form.SubmitButton label="Save Trade" />
              </form.AppForm>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
