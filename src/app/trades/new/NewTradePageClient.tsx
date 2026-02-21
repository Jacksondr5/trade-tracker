"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import {
  Button,
  Card,
  Label,
  RadioGroup,
  RadioGroupItem,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

const tradeSchema = z.object({
  assetType: z.enum(["stock", "crypto"]),
  date: z.string().min(1, "Date is required"),
  direction: z.enum(["long", "short"]),
  notes: z.string().optional(),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((value) => Number.isFinite(Number(value)), "Price must be a valid number"),
  quantity: z
    .string()
    .min(1, "Quantity is required")
    .refine((value) => Number.isFinite(Number(value)), "Quantity must be a valid number"),
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
}: {
  preloadedOpenTradePlans: Preloaded<typeof api.tradePlans.listOpenTradePlans>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTradePlanId = searchParams.get("tradePlanId") || "";
  const createTrade = useMutation(api.trades.createTrade);
  const openTradePlans = usePreloadedQuery(preloadedOpenTradePlans);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      assetType: "stock" as "stock" | "crypto",
      date: getDefaultDateTime(),
      direction: "long" as "long" | "short",
      notes: "",
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
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const parsed = tradeSchema.parse(value);
        await createTrade({
          assetType: parsed.assetType,
          date: new Date(parsed.date).getTime(),
          direction: parsed.direction,
          notes: parsed.notes || undefined,
          price: parseFloat(parsed.price),
          quantity: parseFloat(parsed.quantity),
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
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">New Trade</h1>

      {successMessage && (
        <div className="text-slate-12 mb-4 rounded-md bg-green-900/50 p-4">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="text-slate-12 mb-4 flex items-center justify-between rounded-md bg-red-900/50 p-4">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-12 ml-4 hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
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
                <div className="grid w-full items-center gap-1.5">
                  <label
                    htmlFor={field.name}
                    className="text-slate-12 text-sm font-medium"
                  >
                    Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    id={field.name}
                    data-testid={`${field.name}-input`}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="text-slate-12 h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              )}
            </form.AppField>

            <form.AppField name="ticker">
              {(field) => (
                <field.FieldInput label="Ticker" placeholder="e.g. AAPL" />
              )}
            </form.AppField>

            <form.AppField name="tradePlanId">
              {(field) => (
                <div className="grid w-full items-center gap-1.5">
                  <label
                    htmlFor={field.name}
                    className="text-slate-12 text-sm font-medium"
                  >
                    Trade Plan (optional)
                  </label>
                  <select
                    id={field.name}
                    data-testid={`${field.name}-select`}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="text-slate-12 h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="">No trade plan</option>
                    {openTradePlans.map((tradePlan) => (
                      <option key={tradePlan._id} value={tradePlan._id}>
                        {tradePlan.name} ({tradePlan.instrumentSymbol}) [{tradePlan.status}]
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form.AppField>

            <div className="grid grid-cols-3 gap-6">
              <form.AppField name="assetType">
                {(field) => (
                  <div className="space-y-2">
                    <Label
                      className="text-slate-12 text-sm font-medium"
                      dataTestId={`${field.name}-label`}
                    >
                      Asset Type
                    </Label>
                    <RadioGroup
                      dataTestId={`${field.name}-radio`}
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as "stock" | "crypto")
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="stock" id="asset-stock" />
                        <Label
                          htmlFor="asset-stock"
                          dataTestId="asset-stock-label"
                        >
                          Stock
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="crypto" id="asset-crypto" />
                        <Label
                          htmlFor="asset-crypto"
                          dataTestId="asset-crypto-label"
                        >
                          Crypto
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </form.AppField>

              <form.AppField name="side">
                {(field) => (
                  <div className="space-y-2">
                    <Label
                      className="text-slate-12 text-sm font-medium"
                      dataTestId={`${field.name}-label`}
                    >
                      Side
                    </Label>
                    <RadioGroup
                      dataTestId={`${field.name}-radio`}
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as "buy" | "sell")
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="buy" id="side-buy" />
                        <Label htmlFor="side-buy" dataTestId="side-buy-label">
                          Buy
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sell" id="side-sell" />
                        <Label htmlFor="side-sell" dataTestId="side-sell-label">
                          Sell
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </form.AppField>

              <form.AppField name="direction">
                {(field) => (
                  <div className="space-y-2">
                    <Label
                      className="text-slate-12 text-sm font-medium"
                      dataTestId={`${field.name}-label`}
                    >
                      Direction
                    </Label>
                    <RadioGroup
                      dataTestId={`${field.name}-radio`}
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as "long" | "short")
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="long" id="direction-long" />
                        <Label
                          htmlFor="direction-long"
                          dataTestId="direction-long-label"
                        >
                          Long
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="short" id="direction-short" />
                        <Label
                          htmlFor="direction-short"
                          dataTestId="direction-short-label"
                        >
                          Short
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => router.push("/trades")}
                  dataTestId="cancel-button"
                >
                  Cancel
                </Button>
                <form.SubmitButton
                  label={isSubmitting ? "Saving..." : "Save Trade"}
                />
              </form.AppForm>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
