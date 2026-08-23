const LEGACY_STATEMENT_WARNING_MESSAGES = new Set([
  "No Orders section found",
  "No OpenPositions section found",
  "No CashReport section found",
  "No Trades section found",
]);

export function filterLegacyStatementWarnings(messages: string[]): string[] {
  // Compatibility shim for statement diagnostics written to legacy trade rows;
  // "No Trades section found" is legacy-only with no current producer. Delete
  // this set once those rows have aged out.
  return messages.filter(
    (message) => !LEGACY_STATEMENT_WARNING_MESSAGES.has(message),
  );
}
