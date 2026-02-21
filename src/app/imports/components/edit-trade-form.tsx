import { Button, Card } from "~/components/ui";

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
  values: EditTradeFormValues;
  onCancel: () => void;
  onChange: (field: keyof EditTradeFormValues, value: string) => void;
  onSave: () => void;
}

export function EditTradeForm({ values, onCancel, onChange, onSave }: EditTradeFormProps) {
  return (
    <Card className="mb-4 bg-slate-800 p-4">
      <h3 className="text-slate-12 mb-3 text-sm font-semibold">Edit Trade</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="edit-ticker" className="text-slate-12 mb-1 block text-xs font-medium">Ticker</label>
          <input
            id="edit-ticker"
            type="text"
            value={values.ticker}
            onChange={(e) => onChange("ticker", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-side" className="text-slate-12 mb-1 block text-xs font-medium">Side</label>
          <select
            id="edit-side"
            value={values.side}
            onChange={(e) => onChange("side", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          >
            <option value="">---</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-direction" className="text-slate-12 mb-1 block text-xs font-medium">Direction</label>
          <select
            id="edit-direction"
            value={values.direction}
            onChange={(e) => onChange("direction", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-asset-type" className="text-slate-12 mb-1 block text-xs font-medium">Asset Type</label>
          <select
            id="edit-asset-type"
            value={values.assetType}
            onChange={(e) => onChange("assetType", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          >
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-price" className="text-slate-12 mb-1 block text-xs font-medium">Price</label>
          <input
            id="edit-price"
            type="number"
            step="any"
            value={values.price}
            onChange={(e) => onChange("price", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-quantity" className="text-slate-12 mb-1 block text-xs font-medium">Quantity</label>
          <input
            id="edit-quantity"
            type="number"
            step="any"
            value={values.quantity}
            onChange={(e) => onChange("quantity", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-date" className="text-slate-12 mb-1 block text-xs font-medium">Date</label>
          <input
            id="edit-date"
            type="datetime-local"
            value={values.date}
            onChange={(e) => onChange("date", e.target.value)}
            className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button dataTestId="save-edit-button" onClick={() => void onSave()}>
            Save
          </Button>
          <Button dataTestId="cancel-edit-button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
