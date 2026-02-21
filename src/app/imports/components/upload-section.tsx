import type { ChangeEvent } from "react";
import { Card } from "~/components/ui";
import type { BrokerageSource } from "../../../../shared/imports/types";

interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  withValidationErrors: number;
  withWarnings: number;
}

interface UploadSectionProps {
  brokerage: BrokerageSource;
  errorMessage: string | null;
  importResult: ImportResult | null;
  isImporting: boolean;
  onBrokerageChange: (value: BrokerageSource) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function UploadSection({
  brokerage,
  errorMessage,
  importResult,
  isImporting,
  onBrokerageChange,
  onFileChange,
}: UploadSectionProps) {
  return (
    <Card className="mb-8 bg-slate-800 p-6">
      <h2 className="text-slate-12 mb-4 text-lg font-semibold">Upload CSV</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="brokerage-select"
              className="text-slate-12 mb-1 block text-sm font-medium"
            >
              Brokerage
            </label>
            <select
              id="brokerage-select"
              value={brokerage}
              onChange={(e) => onBrokerageChange(e.target.value as BrokerageSource)}
              className="text-slate-12 h-9 rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="ibkr">Interactive Brokers (IBKR)</option>
              <option value="kraken">Kraken</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="csv-file-input"
              className="text-slate-12 mb-1 block text-sm font-medium"
            >
              CSV File
            </label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={(e) => void onFileChange(e)}
              className="text-slate-12 text-sm file:mr-4 file:rounded-md file:border file:border-slate-600 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-slate-300 file:hover:bg-slate-600"
            />
          </div>
          {isImporting && <div className="text-slate-11 text-sm">Importing...</div>}
        </div>

        {importResult && (
          <div className="text-slate-12 rounded-md bg-green-900/50 p-4 text-sm">
            Imported <span className="font-semibold">{importResult.imported}</span> trade
            {importResult.imported !== 1 ? "s" : ""}.
            {importResult.skippedDuplicates > 0 && (
              <>
                {" "}
                Skipped <span className="font-semibold">{importResult.skippedDuplicates}</span>{" "}
                duplicate{importResult.skippedDuplicates !== 1 ? "s" : ""}.
              </>
            )}
            {importResult.withValidationErrors > 0 && (
              <>
                {" "}
                <span className="font-semibold">{importResult.withValidationErrors}</span> need
                review.
              </>
            )}
            {importResult.withWarnings > 0 && (
              <>
                {" "}
                <span className="font-semibold">{importResult.withWarnings}</span> with warnings.
              </>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md bg-red-900/50 p-4 text-sm text-red-300">{errorMessage}</div>
        )}
      </div>
    </Card>
  );
}
