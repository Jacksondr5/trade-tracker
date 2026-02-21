import { z } from "zod";
import { Button, Card, useAppForm } from "~/components/ui";

export interface EditTradeFormValues {
  assetType: "stock" | "crypto";
  date: string;
  direction: "long" | "short";
  price: string;
  quantity: string;
  side: "buy" | "sell" | "";
  ticker: string;
}

interface EditTradeFormProps {
  initialValues: EditTradeFormValues;
  onCancel: () => void;
  onSave: (values: EditTradeFormValues) => Promise<void>;
}

const editTradeSchema = z.object({
  assetType: z.enum(["stock", "crypto"]),
  date: z.string(),
  direction: z.enum(["long", "short"]),
  price: z.string().refine(
    (value) => !value.trim() || Number.isFinite(Number(value)),
    "Price must be a valid number",
  ),
  quantity: z.string().refine(
    (value) => !value.trim() || Number.isFinite(Number(value)),
    "Quantity must be a valid number",
  ),
  side: z.enum(["buy", "sell", ""]),
  ticker: z.string(),
});

export function EditTradeForm({ initialValues, onCancel, onSave }: EditTradeFormProps) {
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
      await onSave(value);
    },
  });

  return (
    <Card className="mb-4 bg-slate-800 p-4">
      <h3 className="text-slate-12 mb-3 text-sm font-semibold">Edit Trade</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <form.AppField name="ticker">
            {(field) => (
              <field.FieldInput label="Ticker" type="text" className="w-[140px]" />
            )}
          </form.AppField>
          <form.AppField name="side">
            {(field) => (
              <field.FieldSelect
                label="Side"
                className="w-[120px]"
                placeholder="---"
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
                className="w-[120px]"
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
                className="w-[120px]"
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
          <div className="ml-auto flex gap-2">
            <form.AppForm>
              <form.SubmitButton
                dataTestId="save-edit-button"
                label="Save"
                className="h-9"
              />
            </form.AppForm>
            <Button
              type="button"
              dataTestId="cancel-edit-button"
              variant="outline"
              className="h-9"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
