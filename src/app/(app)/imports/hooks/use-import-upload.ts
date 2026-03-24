"use client";

import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { parseIBKRCSV } from "~/lib/imports/ibkr-parser";
import { parseKrakenCSV } from "~/lib/imports/kraken-parser";
import type {
  BrokerageSource,
  InboxTradeCandidate,
} from "../../../../../shared/imports/types";

interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  withValidationErrors: number;
  withWarnings: number;
}

interface UseImportUploadArgs {
  brokerage: BrokerageSource;
  importTrades: (args: { trades: InboxTradeCandidate[] }) => Promise<ImportResult>;
  setErrorMessage: (message: string | null) => void;
}

export function useImportUpload({
  brokerage,
  importTrades,
  setErrorMessage,
}: UseImportUploadArgs) {
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setImportResult(null);
    setErrorMessage(null);
  };

  const handleImport = async () => {
    if (!selectedFile || isImporting) return;

    setImportResult(null);
    setErrorMessage(null);
    setIsImporting(true);

    try {
      const content = await selectedFile.text();
      const parseResult = brokerage === "ibkr" ? parseIBKRCSV(content) : parseKrakenCSV(content);

      if (parseResult.trades.length === 0) {
        setErrorMessage(
          parseResult.errors.length > 0
            ? `No trades parsed. Errors: ${parseResult.errors.slice(0, 3).join("; ")}`
            : "No trades found in CSV.",
        );
        return;
      }

      const result = await importTrades({ trades: parseResult.trades });
      setImportResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  return {
    fileInputRef,
    handleFileChange,
    handleImport,
    importResult,
    isImporting,
    selectedFile,
    setImportResult,
  };
}
