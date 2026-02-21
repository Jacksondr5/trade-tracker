"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { z } from "zod";
import { Button, Card, useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";

interface TradePlanOption {
  _id: Id<"tradePlans">;
  instrumentSymbol: string;
  name: string;
  status: string;
}

export interface EditTradeFormValues {
  assetType: "stock" | "crypto";
  date: string;
  direction: "long" | "short";
  notes: string;
  price: string;
  quantity: string;
  side: "buy" | "sell";
  ticker: string;
  tradePlanId: string;
}

interface EditTradeFormProps {
  initialValues: EditTradeFormValues;
  onCancel: () => void;
  onSaved: () => void;
  tradeId: Id<"trades">;
  tradePlans: TradePlanOption[];
}

const editTradeSchema = z.object({
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

export function EditTradeForm({
  initialValues,
  onCancel,
  onSaved,
  tradeId,
  tradePlans,
}: EditTradeFormProps) {
  const updateTrade = useMutation(api.trades.updateTrade);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: initialValues satisfies EditTradeFormValues,
    validators: {
      onChange: ({ value }) => {
        const results = editTradeSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      try {
        const parsed = editTradeSchema.parse(value);
        await updateTrade({
          assetType: parsed.assetType,
          date: new Date(parsed.date).getTime(),
          direction: parsed.direction,
          notes: parsed.notes || undefined,
          price: parseFloat(parsed.price),
          quantity: parseFloat(parsed.quantity),
          side: parsed.side,
          ticker: parsed.ticker.toUpperCase(),
          tradeId,
          tradePlanId: parsed.tradePlanId
            ? (parsed.tradePlanId as Id<"tradePlans">)
            : null,
        });
        onSaved();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update trade";
        setErrorMessage(message);
      }
    },
  });

  return (
    <Card className="bg-slate-800 p-4">
      <h3 className="text-slate-12 mb-3 text-sm font-semibold">Edit Trade</h3>
      {errorMessage && (
        <div className="text-slate-12 mb-3 flex items-center justify-between rounded-md bg-red-900/50 p-3 text-sm">
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <form.AppField name="ticker">
              {(field) => (
                <field.FieldInput
                  label="Ticker"
                  type="text"
                  className="w-[140px]"
                />
              )}
            </form.AppField>
            <form.AppField name="tradePlanId">
              {(field) => (
                <field.FieldSelect
                  label="Trade Plan"
                  className="w-[200px]"
                  placeholder="No trade plan"
                  options={tradePlans.map((tp) => ({
                    label: `${tp.name} (${tp.instrumentSymbol}) [${tp.status}]`,
                    value: tp._id,
                  }))}
                />
              )}
            </form.AppField>
            <form.AppField name="side">
              {(field) => (
                <field.FieldSelect
                  label="Side"
                  className="w-[100px]"
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
                  className="w-[110px]"
                  options={[
                    { label: "Long", value: "long" },
                    { label: "Short", value: "short" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="assetType">
              {(field) => (
                <field.FieldSelect
                  label="Asset Type"
                  className="w-[110px]"
                  options={[
                    { label: "Stock", value: "stock" },
                    { label: "Crypto", value: "crypto" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="price">
              {(field) => (
                <field.FieldInput
                  label="Price"
                  type="number"
                  step="any"
                  className="w-[120px]"
                />
              )}
            </form.AppField>
            <form.AppField name="quantity">
              {(field) => (
                <field.FieldInput
                  label="Quantity"
                  type="number"
                  step="any"
                  className="w-[120px]"
                />
              )}
            </form.AppField>
            <form.AppField name="date">
              {(field) => (
                <field.FieldInput
                  label="Date"
                  type="datetime-local"
                  className="w-[200px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppField name="notes">
            {(field) => (
              <field.FieldTextarea
                label="Notes (optional)"
                placeholder="Add any notes about this trade..."
                rows={2}
              />
            )}
          </form.AppField>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              dataTestId="cancel-edit-button"
              variant="outline"
              className="h-9"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <form.AppForm>
              <form.SubmitButton
                dataTestId="save-edit-button"
                label="Save"
                className="h-9"
              />
            </form.AppForm>
          </div>
        </div>
      </form>
    </Card>
  );
}
